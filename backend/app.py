"""ChainVerify Flask API."""
import gzip
import hashlib
import html as html_module
import json
import os
import re
import sqlite3
import time
import urllib.error
import urllib.request
import zlib
from collections import Counter, defaultdict, deque
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from flask import Flask, request, jsonify
from flask_cors import CORS
from playwright.sync_api import sync_playwright

from . import auth, blockchain, watermark
from .auth import require_auth
from .database import get_connection, init_db
from .publishers import (canonical_publisher, host_matches, is_trusted,
                         publisher_domains, same_publisher, trusted_list)

app = Flask(__name__)
CORS(app)

init_db()
blockchain.create_genesis_block()

MIN_NEW_ARTICLE_LEN = 200
MIN_NEW_TITLE_LEN = 10
MAX_NEW_ARTICLE_LEN = 20000
FETCH_TIMEOUT = 15
MAX_FETCH_BYTES = 2_000_000
TX_HASH_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RPC_URL = os.environ.get("CHAINVERIFY_RPC_URL", "http://127.0.0.1:8545")
CONTRACT_FILE = Path(__file__).resolve().parent.parent / "frontend" / "src" / "contract-address.json"


@contextmanager
def db():
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()


# ---------------------------------------------------------------- fetching ---
def _url_ok(url, domains):
    try:
        p = urlparse(url)
    except ValueError:
        return False
    return p.scheme in ("http", "https") and host_matches(p.hostname or "", domains)


class _DomainRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, domains):
        super().__init__()
        self.domains = domains

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _url_ok(newurl, self.domains):
            raise urllib.error.URLError("Redirected outside the publisher's domain.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _fetch_html(url, domains):
    opener = urllib.request.build_opener(_DomainRedirect(domains))
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }
    req = urllib.request.Request(url, headers=headers)
    with opener.open(req, timeout=FETCH_TIMEOUT) as r:
        raw = r.read(MAX_FETCH_BYTES + 1)
        enc = (r.headers.get("Content-Encoding") or "").lower()
    if len(raw) > MAX_FETCH_BYTES:
        raise ValueError("Page is too large.")
    if enc == "gzip":
        raw = gzip.decompress(raw)
    elif enc == "deflate":
        try:
            raw = zlib.decompress(raw)
        except zlib.error:
            raw = zlib.decompress(raw, -zlib.MAX_WBITS)
    return raw.decode("utf-8", errors="ignore")


def _fetch_html_playwright(url):
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ])
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1920, "height": 1080}
            )
            page = context.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            
            try:
                page.wait_for_selector("div.artText, div.Normal, div.storyDetails, div#pcl-full-content, h1", timeout=8000)
            except:
                pass
                
            html = page.content()
            browser.close()
            return html
    except Exception as e:
        raise Exception(f"Playwright rendering failed: {e}")


def _is_garbage(text):
    if not text or len(text) < 50:
        return True
    valid_chars = sum(1 for c in text if c.isalnum() or c in " \n\r\t.,!?;:'\"()-")
    return (valid_chars / len(text)) < 0.4


def _unescape(s):
    return html_module.unescape(s) if s else ""


def _clean_category(raw):
    if not raw:
        return ""
    cleaned = raw.replace("_", " ").replace("-", " ").title()
    cleaned = re.sub(r'\s+(And|Or)$', '', cleaned, flags=re.I)
    return cleaned


def _category_from_url(url):
    try:
        segs = [s for s in urlparse(url).path.strip("/").split("/") if s]
        # Added 'article' to the ignore list for Indian Express
        ignore = {"news", "articles", "article", "story", "index.html", "www", "live", "videos", "audio", "topics", "watch", "listen", "articleshow", "cms"}
        
        for seg in segs:
            if seg.lower() in ignore:
                continue
            if re.match(r'^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9]{8,}$', seg) and '-' not in seg:
                continue
            if seg.isdigit():
                continue
            if len(seg) > 2:
                return _clean_category(seg)
    except Exception:
        pass
    return ""


# Expanded to drop Hindi AI disclaimers and feedback prompts
BOILERPLATE_EXACT = (
    "cookie", "subscribe", "advertisement", "sign up", "sign in", "follow us", "read more",
    "share this", "newsletter", "click here", "all rights reserved", "privacy policy", "sponsored",
    "you can also check", "gold rate in", "silver rate in", "bank holidays in", "public holidays in",
    "weather in", "petrol price in", "diesel price in", "cng price in", "lpg price in", "t20 world cup",
    "मूल अंग्रेजी लेख", "your feedback has been reported", "ai द्वारा अनुदित", "translated by ai"
)


def _parse_soup(soup, url):
    title = ""
    og = soup.find("meta", property="og:title") or soup.find("meta", attrs={"name": "og:title"})
    if og:
        title = og.get("content", "")
    if not title and soup.find("h1"):
        title = soup.find("h1").get_text(strip=True)
    if not title and soup.find("title"):
        title = re.sub(r"\s*[\|\-–—]\s*[^|\-–—]{0,60}$", "", soup.find("title").get_text(strip=True)).strip()
    title = _unescape(title)

    date = ""
    for name in ["article:published_time", "og:published_time", "datePublished", "pubdate"]:
        meta = soup.find("meta", property=name) or soup.find("meta", attrs={"name": name})
        if meta and meta.get("content"):
            date = meta["content"]
            break
    if not date:
        span = soup.find(class_=re.compile(r"publish_date|datePublished|storyDate", re.I))
        if span:
            txt = span.get_text(strip=True)
            match = re.search(r'([A-Z][a-z]{2} \d{1,2}, \d{4})', txt)
            if match:
                try:
                    dt = datetime.strptime(match.group(1), "%b %d, %Y")
                    date = dt.strftime("%Y-%m-%d")
                except:
                    date = match.group(1)
    if not date:
        match = re.search(r'(\d{4}-\d{2}-\d{2})', str(soup))
        if match: date = match.group(1)
        
    if date:
        m = re.match(r"(\d{4})-(\d{2})-(\d{2})", str(date))
        if m: date = m.group(0)
        else: date = ""

    # --- CATEGORY EXTRACTION (NO PROPER NOUNS) ---
    category = ""
    
    # 1. JSON-LD
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            json_text = script.get_text()
            if not json_text: continue
            data = json.loads(json_text)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict) and "articleSection" in item:
                    cat_val = item["articleSection"]
                    category = cat_val[0] if isinstance(cat_val, list) else cat_val
                    break
        except Exception:
            pass
        if category:
            break

    # 2. Breadcrumbs
    if not category:
        breadcrumbs = soup.find_all("a", class_=re.compile(r"(breadcrumb|category|section|navigation)", re.I))
        if breadcrumbs:
            for bc in reversed(breadcrumbs):
                txt = bc.get_text(strip=True)
                if txt and txt.lower() not in ["home", "news", "india", "times of india", "hindustan times", "indian express"]:
                    category = txt
                    break

    # 3. URL path (For Indian Express, this grabs 'India' from /article/india/)
    if not category:
        category = _category_from_url(url)

    # 4. Standard meta tags
    if not category:
        for meta_name in ["article:section", "section", "category"]:
            meta = soup.find("meta", property=meta_name) or soup.find("meta", attrs={"name": meta_name})
            if meta and meta.get("content"):
                category = meta["content"].split(",")[0].strip()
                break

    # 5. Heuristic Fallback
    if not category or category.lower() == "general":
        tl = title.lower()
        if "india" in tl or "delhi" in tl or "mumbai" in tl or "dussehra" in tl: category = "India"
        elif "us " in tl or "trump" in tl or "biden" in tl or "washington" in tl: category = "US"
        elif "uk " in tl or "london" in tl or "britain" in tl: category = "UK"
        elif "sport" in tl or "football" in tl or "cricket" in tl or "olympic" in tl: category = "Sport"
        elif "business" in tl or "market" in tl or "economy" in tl: category = "Business"
        else: category = "General"

    # news_keywords is completely removed because it causes proper nouns like "Marco Rubio" to appear as categories.
    
    category = _clean_category(category)

    # --- BODY EXTRACTION ---
    for tag in soup(["script", "style", "nav", "header", "footer", "aside", "form", "noscript", "iframe"]):
        tag.decompose()

    paragraphs = []
    
    # Target specific containers
    toi_box = soup.find("div", class_="artText") or soup.find("div", class_="Normal")
    ht_box = soup.find("div", class_="storyDetails")
    ie_box = soup.find("div", id="pcl-full-content") or soup.find("div", class_="articlebodycontent")
    
    target_box = toi_box or ht_box or ie_box
    
    if target_box:
        for br in target_box.find_all("br"):
            br.replace_with("\n")
        raw_text = target_box.get_text(separator="\n", strip=True)
        lines = [line.strip() for line in raw_text.split("\n") if len(line.strip()) > 40]
        for line in lines:
            # Using 'w in line.lower()' so it catches the text even if it has padding
            if not any(w in line.lower() for w in BOILERPLATE_EXACT):
                paragraphs.append(line)
    else:
        # Fallback for generic sites
        box = (
            soup.find("article") 
            or soup.find("div", itemprop="articleBody")
            or soup.find("div", class_=re.compile(r"(article|story|content|body|paywall|artText|artikel)", re.I)) 
            or soup.body or soup
        )
        for p in box.find_all("p"):
            txt = p.get_text(separator=" ", strip=True)
            if len(txt) > 40 and not any(w in txt.lower() for w in BOILERPLATE_EXACT):
                paragraphs.append(txt)

    body = "\n\n".join(paragraphs)[:MAX_NEW_ARTICLE_LEN]

    return title, date, category, body


def _extract_article_data(url, domains):
    html = ""
    is_hard_site = "timesofindia.indiatimes.com" in url or "hindustantimes.com" in url
    
    if is_hard_site:
        try:
            html = _fetch_html_playwright(url)
        except Exception:
            pass
    else:
        try:
            html = _fetch_html(url, domains)
        except Exception:
            pass

    title, date, category, body = ("", "", "", "")
    
    if html:
        soup = BeautifulSoup(html, "html.parser")
        title, date, category, body = _parse_soup(soup, url)

    if (_is_garbage(body) or len(body) < 80) and not is_hard_site:
        try:
            html_js = _fetch_html_playwright(url)
            soup_js = BeautifulSoup(html_js, "html.parser")
            pt, pd, pc, pb = _parse_soup(soup_js, url)
            
            if not _is_garbage(pb) and len(pb) >= 80:
                title, date, category, body = pt, pd, pc, pb
        except Exception:
            pass

    if _is_garbage(body) or len(body) < 80:
        return {"ok": False, "error": "The website is actively blocking automated requests or loading content dynamically. Please try a different article link."}

    return {"ok": True, "title": title, "content": body, "publication_date": date, "category": category}

# -------------------------------------------------------------------- auth ---
_FAILED = defaultdict(deque)
MAX_FAILS, FAIL_WINDOW = 5, 300

def _locked(key):
    q, now = _FAILED[key], time.time()
    while q and now - q[0] > FAIL_WINDOW:
        q.popleft()
    return len(q) >= MAX_FAILS

def _user_json(row):
    return {"id": row["id"], "email": row["email"], "role": row["role"],
            "publisher_source": row["publisher_source"], "publisher_id": row["publisher_id"]}

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

@app.route("/auth/register", methods=["POST"])
def auth_register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = (data.get("role") or "user").strip().lower()
    code = (data.get("publisher_code") or "").strip()

    err = auth.validate_email(email, role, code)
    if err:
        return jsonify({"error": err}), 400
    pub_source = auth.PUBLISHER_IDS[code.upper()]["source"] if role == "publisher" else None
    err = auth.validate_password(password, email, pub_source)
    if err:
        return jsonify({"error": err}), 400
    pub_id = ("PUB-" + hashlib.sha1(f"{email}|{time.time()}".encode()).hexdigest()[:10].upper()
              if role == "publisher" else None)
    
    try:
        with db() as conn:
            if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
                return jsonify({"error": "Email already registered."}), 409
            
            cur = conn.execute(
                "INSERT INTO users (email, password_hash, role, publisher_source, publisher_id) VALUES (?,?,?,?,?)",
                (email, auth.hash_password(password), role, pub_source, pub_id))
            conn.commit()
            user_id = cur.lastrowid
    except sqlite3.IntegrityError:
        return jsonify({"error": "Email already registered."}), 409
        
    user = {"id": user_id, "email": email, "role": role, "publisher_source": pub_source, "publisher_id": pub_id}
    return jsonify({"success": True, "token": auth.create_session(user_id), "user": user}), 201

@app.route("/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    key = f"{email}|{request.remote_addr}"
    if _locked(key):
        return jsonify({"error": "Too many failed attempts. Try again in 5 minutes."}), 429
    with db() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not auth.verify_password(password, row["password_hash"]):
        _FAILED[key].append(time.time())
        return jsonify({"error": "Invalid email or password."}), 401
    _FAILED.pop(key, None)
    return jsonify({"success": True, "token": auth.create_session(row["id"]), "user": _user_json(row)})

@app.route("/auth/logout", methods=["POST"])
def auth_logout():
    token = auth._extract_token()
    if token:
        auth.delete_session(token)
    return jsonify({"success": True})

@app.route("/auth/me")
@require_auth()
def auth_me():
    return jsonify({"user": request.user})

# --------------------------------------------------------------- analytics ---
@app.route("/analytics")
def analytics():
    with db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM news_articles").fetchone()[0]
        registered = conn.execute("SELECT COUNT(*) FROM registered_articles").fetchone()[0]
        blocks = conn.execute("SELECT COUNT(*) FROM blockchain_blocks").fetchone()[0]
        by_category = [{"category": r[0], "count": r[1]} for r in conn.execute(
            "SELECT category, COUNT(*) FROM news_articles WHERE category <> '' "
            "GROUP BY category ORDER BY COUNT(*) DESC LIMIT 10")]

        counter = Counter()
        for src, cnt in conn.execute("SELECT source, COUNT(*) FROM news_articles GROUP BY source"):
            name = canonical_publisher(src)
            if name:
                counter[name] += cnt
        by_source = [{"source": s, "count": c} for s, c in counter.most_common(10)]

        cutoff = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
        hour_rows = conn.execute(
            "SELECT substr(timestamp, 1, 13) AS hr, COUNT(*) AS cnt FROM blockchain_blocks "
            "WHERE block_index > 0 AND timestamp >= ? GROUP BY hr ORDER BY hr", (cutoff,)).fetchall()
        last_block = conn.execute(
            "SELECT timestamp FROM blockchain_blocks WHERE block_index > 0 ORDER BY block_index DESC LIMIT 1").fetchone()
        avg_len = round(conn.execute("SELECT AVG(LENGTH(normalized_content)) FROM registered_articles").fetchone()[0] or 0)
        
        recent = [{"article_id": r["article_id"], "title": r["title"], "block_index": r["block_index"],
                   "registered_at": r["ts"], "registered_by": canonical_publisher(r["source"])}
                  for r in conn.execute(
                      "SELECT r.article_id, r.title, r.block_index, b.timestamp AS ts, n.source AS source "
                      "FROM registered_articles r LEFT JOIN blockchain_blocks b ON b.block_index = r.block_index "
                      "LEFT JOIN news_articles n ON n.article_id = r.article_id "
                      "ORDER BY r.block_index DESC LIMIT 5")]
    return jsonify({
        "total_articles": total, "registered_articles": registered, "not_registered": total - registered,
        "total_blocks": blocks, "avg_content_length": avg_len, "by_category": by_category,
        "by_source": by_source, "blocks_by_hour": [{"hour": r["hr"], "count": r["cnt"]} for r in hour_rows],
        "last_block_at": last_block["timestamp"] if last_block else None, "recent_registrations": recent})

@app.route("/stats")
def stats():
    with db() as conn:
        return jsonify({"articles": conn.execute("SELECT COUNT(*) FROM news_articles").fetchone()[0],
                        "registered": conn.execute("SELECT COUNT(*) FROM registered_articles").fetchone()[0],
                        "blocks": conn.execute("SELECT COUNT(*) FROM blockchain_blocks").fetchone()[0]})

@app.route("/trusted-sources")
def trusted_sources():
    return jsonify({"sources": trusted_list()})

# ---------------------------------------------------------------- articles ---
def _publisher_url_error(url, source):
    if not url:
        return "URL is required."
    if (urlparse(url).path or "").strip() in ("", "/"):
        return "URL is a homepage."
    if not _url_ok(url, publisher_domains(source)):
        return "Domain mismatch."
    return None

@app.route("/articles/check-url", methods=["POST"])
@require_auth(roles=["publisher"])
def check_url():
    data = request.get_json(silent=True) or {}
    url, claimed = (data.get("url") or "").strip(), (data.get("source") or "").strip()
    if not url or not claimed:
        return jsonify({"error": "URL and Publisher required."}), 400
    if not is_trusted(claimed):
        return jsonify({"error": "Untrusted publisher."}), 400
    if not same_publisher(claimed, request.user.get("publisher_source")):
        return jsonify({"error": "Account mismatch."}), 403
    err = _publisher_url_error(url, claimed)
    if err:
        return jsonify({"error": err}), 400
    with db() as conn:
        if conn.execute("SELECT 1 FROM news_articles WHERE url = ?", (url,)).fetchone():
            return jsonify({"already_exists": True, "error": "URL already added."}), 200
    extracted = _extract_article_data(url, publisher_domains(claimed))
    if not extracted.get("ok"):
        return jsonify({"error": extracted.get("error")}), 400
    return jsonify({"reachable": True, "already_exists": False,
                    "extracted": {k: extracted[k] for k in ("title", "content", "publication_date", "category")}})

@app.route("/articles/add", methods=["POST"])
@require_auth(roles=["publisher"])
def add_article():
    data = request.get_json(silent=True) or {}
    title, content = (data.get("title") or "").strip(), (data.get("content") or "").strip()
    source = canonical_publisher(data.get("source"))
    url, date = (data.get("url") or "").strip(), (data.get("publication_date") or "").strip()
    category = (data.get("category") or "").strip()

    if len(title) < MIN_NEW_TITLE_LEN or len(content) < MIN_NEW_ARTICLE_LEN:
        return jsonify({"error": "Content too short."}), 400
    if len(content) > MAX_NEW_ARTICLE_LEN:
        return jsonify({"error": "Content too long."}), 400
    if not is_trusted(source) or not same_publisher(source, request.user.get("publisher_source")):
        return jsonify({"error": "Publisher mismatch."}), 403
    err = _publisher_url_error(url, source)
    if err:
        return jsonify({"error": err}), 400
    if date and not DATE_RE.match(date):
        return jsonify({"error": "Date must be YYYY-MM-DD."}), 400

    article_id = "ext-" + hashlib.md5(f"{url}|{time.time()}".encode()).hexdigest()[:10]
    try:
        with db() as conn:
            conn.execute("INSERT INTO news_articles (article_id, title, content, source, publication_date, category, url) "
                         "VALUES (?,?,?,?,?,?,?)", (article_id, title, content, source, date, category, url))
            conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "URL exists."}), 409
    return jsonify({"success": True, "article_id": article_id, "title": title, "source": source,
                    "url": url, "publication_date": date, "category": category}), 201

# ------------------------------------------------------------ registration ---
def _owned_article(conn, article_id):
    art = conn.execute("SELECT * FROM news_articles WHERE article_id = ?", (article_id,)).fetchone()
    if art is None:
        return None, (jsonify({"error": "Article not found."}), 404)
    if not same_publisher(art["source"], request.user.get("publisher_source")):
        return None, (jsonify({"error": "You can only register articles published by your own organisation."}), 403)
    return art, None

def _fingerprint(article):
    normalized = watermark.normalize_text(article["content"] or "")
    content_hash = watermark.generate_sha256(normalized)
    return normalized, content_hash, watermark.generate_watermark_id(article["article_id"], content_hash)

def _check_tx_on_chain(tx_hash):
    try:
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_getTransactionReceipt", "params": [tx_hash]}).encode()
        req = urllib.request.Request(RPC_URL, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=3) as r:
            res = json.loads(r.read()).get("result")
        contract = json.loads(CONTRACT_FILE.read_text())["ChainVerify"].lower()
    except Exception:
        return None
    if not res or res.get("status") != "0x1":
        return False
    return (res.get("to") or "").lower() == contract

@app.route("/register/prepare", methods=["POST"])
@require_auth(roles=["publisher"])
def register_prepare():
    article_id = ((request.get_json(silent=True) or {}).get("article_id") or "").strip()
    with db() as conn:
        art, err = _owned_article(conn, article_id)
        if err:
            return err
        existing = conn.execute("SELECT * FROM registered_articles WHERE article_id = ?", (article_id,)).fetchone()
        base = {"article_id": article_id, "title": art["title"], "source": canonical_publisher(art["source"])}
        if existing:
            return jsonify({**base, "already_registered": True, "content_hash": existing["content_hash"],
                            "watermark_id": existing["watermark_id"], "block_index": existing["block_index"]})
        _, content_hash, wm_id = _fingerprint(art)
    return jsonify({**base, "already_registered": False, "content_hash": content_hash, "watermark_id": wm_id})

@app.route("/register/confirm", methods=["POST"])
@require_auth(roles=["publisher"])
def register_confirm():
    data = request.get_json(silent=True) or {}
    article_id = (data.get("article_id") or "").strip()
    tx_hash = (data.get("tx_hash") or "").strip()
    client_hash, client_wm = (data.get("content_hash") or "").strip(), (data.get("watermark_id") or "").strip()
    try:
        onchain_block = int(data.get("onchain_block"))
    except (TypeError, ValueError):
        onchain_block = None
    if tx_hash != "synced-from-chain" and not TX_HASH_RE.match(tx_hash):
        return jsonify({"error": "tx_hash must be a 0x-prefixed 32-byte hash."}), 400

    tx_ok = None if tx_hash == "synced-from-chain" else _check_tx_on_chain(tx_hash)
    if tx_ok is False:
        return jsonify({"error": "Transaction not found on the chain, failed, or not sent to the ChainVerify contract."}), 400

    with db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        art, err = _owned_article(conn, article_id)
        if err:
            return err
        existing = conn.execute("SELECT * FROM registered_articles WHERE article_id = ?", (article_id,)).fetchone()
        base = {"article_id": article_id, "title": art["title"], "source": canonical_publisher(art["source"])}
        if existing:
            return jsonify({**base, "already_registered": True, "content_hash": existing["content_hash"],
                            "watermark_id": existing["watermark_id"], "block_index": existing["block_index"],
                            "registered_at": existing["registered_at"]})
        normalized, content_hash, wm_id = _fingerprint(art)
        if (client_hash and client_hash != content_hash) or (client_wm and client_wm != wm_id):
            return jsonify({"error": "Article text changed after the hash was prepared. Please prepare again."}), 409
        block = blockchain.add_block(conn=conn, article_id=article_id, title=art["title"] or "",
                                     source=base["source"], content_hash=content_hash,
                                     watermark_id=wm_id, watermark_status="embedded")
        conn.execute(
            "INSERT INTO registered_articles (article_id, title, normalized_content, watermarked_content, content_hash, "
            "watermark_id, watermark_status, block_index, registered_by, tx_hash, onchain_block) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (article_id, art["title"] or "", normalized, watermark.embed_watermark(normalized, wm_id), content_hash,
             wm_id, "embedded", block["block_index"], request.user["email"], tx_hash, onchain_block))
        conn.commit()
    return jsonify({**base, "success": True, "already_registered": False, "content_hash": content_hash,
                    "watermark_id": wm_id, "watermark_status": "embedded", "block_index": block["block_index"],
                    "previous_hash": block["previous_hash"], "block_hash": block["block_hash"],
                    "tx_hash": tx_hash, "tx_verified": tx_ok is True, "onchain_block": onchain_block,
                    "registered_at": block["timestamp"]})

# -------------------------------------------------------------------- news ---
@app.route("/news")
def list_news():
    q = request.args.get("q", "").strip()
    category = request.args.get("category", "").strip()
    sort = request.args.get("sort", "published")
    
    try:
        limit = int(request.args.get("limit", 300))
    except ValueError:
        limit = 300
    offset = 0

    conn = get_connection(); cur = conn.cursor()
    where, params = " WHERE 1=1", []
    if q: where += " AND (n.title LIKE ? OR n.content LIKE ?)"; params.extend([f"%{q}%", f"%{q}%"])
    if category: where += " AND n.category = ?"; params.append(category)

    order_by = "n.id DESC" if sort == "added" else "n.publication_date DESC, n.id DESC"

    rows = cur.execute(f"""
        SELECT n.article_id, n.title, n.source, n.publication_date, n.category, n.url, 
               substr(n.content, 1, 220) as preview_content, 
               r.block_index 
        FROM news_articles n 
        LEFT JOIN registered_articles r ON n.article_id = r.article_id 
        {where} 
        ORDER BY {order_by} 
        LIMIT ? OFFSET ?
    """, params + [limit, offset]).fetchall()
    
    total = cur.execute(f"SELECT COUNT(*) FROM news_articles n {where}", params).fetchone()[0]
    categories = [r[0] for r in cur.execute("SELECT DISTINCT category FROM news_articles WHERE category <> '' ORDER BY category")]
    conn.close()

    return jsonify({
        "articles": [
            {
                "article_id": r["article_id"],
                "title": r["title"],
                "source": canonical_publisher(r["source"]),
                "publication_date": r["publication_date"],
                "category": r["category"],
                "url": r["url"],
                "preview": (r["preview_content"] or "") + "...", 
                "registered": r["block_index"] is not None,
                "block_index": r["block_index"],
            }
            for r in rows
        ],
        "total": total,
        "categories": categories,
    })

@app.route("/news/<path:article_id>")
def get_news(article_id):
    with db() as conn:
        row = conn.execute(
            "SELECT n.*, r.block_index, r.content_hash, r.watermark_id, r.watermark_status, r.tx_hash "
            "FROM news_articles n LEFT JOIN registered_articles r ON n.article_id = r.article_id "
            "WHERE n.article_id = ?", (article_id,)).fetchone()
    if not row:
        return jsonify({"error": "Not found."}), 404
    data = {k: row[k] for k in row.keys()}
    data["source"] = canonical_publisher(data.get("source"))
    data["registered"] = data.get("block_index") is not None
    return jsonify(data)

@app.route("/news/<path:article_id>/watermark")
def get_watermark(article_id):
    with db() as conn:
        row = conn.execute("SELECT watermarked_content, watermark_id FROM registered_articles WHERE article_id = ?",
                           (article_id,)).fetchone()
    if not row:
        return jsonify({"error": "Not registered."}), 404
    text = row["watermarked_content"] or ""
    return jsonify({"watermark_id": row["watermark_id"], "preview": watermark.make_visible(text, 400),
                    "total_zw_chars": sum(1 for c in text if c in "\u200b\u200c"),
                    "decoded_id": watermark.extract_watermark(text)})

@app.route("/verify", methods=["POST"])
def verify_article():
    data = request.get_json(silent=True) or {}
    article_id, content = (data.get("article_id") or "").strip(), data.get("content")
    with db() as conn:
        source_mode = "pasted text"
        if not content and article_id:
            row = conn.execute("SELECT content FROM news_articles WHERE article_id = ?", (article_id,)).fetchone()
            if not row:
                return jsonify({"error": "Not found."}), 404
            content, source_mode = row["content"], "archive copy"
        if not (content or "").strip():
            return jsonify({"error": "Nothing to verify."}), 400

        submitted = watermark.generate_sha256(watermark.normalize_text(content))
        match = conn.execute(
            "SELECT r.*, b.source, b.block_hash, b.previous_hash, b.timestamp FROM registered_articles r "
            "JOIN blockchain_blocks b ON r.block_index = b.block_index WHERE r.content_hash = ? LIMIT 1",
            (submitted,)).fetchone()
        if match:
            wm = watermark.extract_watermark(content or "")
            return jsonify({
                "match": True, "checked": source_mode, "submitted_hash": submitted,
                "registered_hash": match["content_hash"], "article_id": match["article_id"],
                "title": match["title"], "source": canonical_publisher(match["source"]),
                "block_index": match["block_index"], "block_hash": match["block_hash"],
                "previous_hash": match["previous_hash"], "timestamp": match["timestamp"],
                "watermark_detected": bool(wm), "watermark_id": wm or match["watermark_id"]})
        reg = (conn.execute("SELECT content_hash FROM registered_articles WHERE article_id = ?", (article_id,)).fetchone()
               if article_id else None)
    reason = ("This article is registered, but the submitted text produces a different hash (text was changed)."
              if reg else "No registered article has this hash (text was modified or never registered).")
    return jsonify({"match": False, "checked": source_mode, "submitted_hash": submitted,
                    "registered_hash": reg["content_hash"] if reg else None, "reason": reason})

@app.route("/chain")
def get_chain():
    return jsonify({"chain": blockchain.get_chain()})

@app.route("/chain/validate")
def validate_chain():
    return jsonify(blockchain.validate_chain())

if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1", port=5000)