"""Import news articles from data/news.csv into SQLite."""
import csv
import hashlib
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

from backend.database import get_connection, init_db

CSV_PATH = Path(__file__).parent / "data" / "news.csv"
MIN_CONTENT_LEN = 80

DOMAIN_TO_PUBLISHER = {
    "cnn.com":                     "CNN",
    "bbc.com":                     "BBC",
    "bbc.co.uk":                   "BBC",
    "reuters.com":                 "Reuters",
    "apnews.com":                  "Associated Press",
    "thehindu.com":                "The Hindu",
    "indianexpress.com":           "Indian Express",
    "hindustantimes.com":          "Hindustan Times",
    "timesofindia.indiatimes.com": "Times of India",
    "thewire.in":                  "The Wire",
    "ptinews.com":                 "PTI",
    "wii.gov.in":                  "Ministry of Environment",
}

COLUMN_MAP = {
    "article_id":       ["article_id", "id", "ArticleId", "ID", "Id"],
    "title":            ["title", "headline", "Headline", "Title", "HEADLINE"],
    "content":          ["content", "text", "article", "body", "Content",
                         "full_text", "article_text", "TEXT", "CONTENT"],
    "source":           ["source", "publisher", "Source", "Publisher",
                         "SOURCE", "PUBLISHER"],
    "author":           ["author", "Author", "AUTHOR"],
    "publication_date": ["publication_date", "date", "Date", "published",
                         "published_at", "Published", "DATE", "PUBLICATION_DATE"],
    "category":         ["category", "topics", "label", "Category", "Topics",
                         "subject", "Label", "topcis",
                         "TOPICS", "CATEGORY", "SUBJECT"],
    "url":              ["url", "link", "URL", "Link", "URL_LINK"],
}


def _pick(row, field):
    for key in COLUMN_MAP[field]:
        if key in row:
            v = row[key]
            if v is None:
                continue
            v = str(v).strip()
            if v:
                return v
    return ""


def _clean_category(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        return ""
    if raw.startswith("[") and raw.endswith("]"):
        try:
            arr = json.loads(raw)
            if isinstance(arr, list) and arr:
                pretty = [str(x).replace("-", " ").replace("_", " ").title() for x in arr]
                return " / ".join(pretty)
        except (ValueError, TypeError):
            pass
    return raw.replace("-", " ").replace("_", " ").title()


def _publisher_from_url(url: str) -> str:
    if not url:
        return ""
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return ""
    if host.startswith("www."):
        host = host[4:]
    for domain, publisher in DOMAIN_TO_PUBLISHER.items():
        if host == domain or host.endswith("." + domain):
            return publisher
    return ""


def _shorten_id(raw_id: str) -> str:
    if raw_id.startswith(("http://", "https://")):
        h = hashlib.md5(raw_id.encode("utf-8")).hexdigest()[:10]
        return f"cnn-{h}"
    return raw_id


def import_news():
    if not CSV_PATH.exists():
        print(f"[!] Dataset not found at {CSV_PATH}")
        sys.exit(1)

    init_db()
    conn = get_connection()
    cur = conn.cursor()

    inserted = skip_id = skip_title = skip_content = skip_source = skip_dup = 0

    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        print(f"[i] Detected columns: {reader.fieldnames}")

        for row in reader:
            raw_id  = _pick(row, "article_id")
            title   = _pick(row, "title")
            content = _pick(row, "content")
            url     = _pick(row, "url") or (
                raw_id if raw_id.startswith(("http://", "https://")) else ""
            )
            raw_source = _pick(row, "source")
            author     = _pick(row, "author")

            if not raw_id:      skip_id += 1;      continue
            if not title:       skip_title += 1;   continue
            if len(content) < MIN_CONTENT_LEN: skip_content += 1; continue

            publisher = _publisher_from_url(url) or raw_source or author
            if not publisher:
                skip_source += 1
                continue

            article_id = _shorten_id(raw_id)
            category   = _clean_category(_pick(row, "category"))

            cur.execute("""
                INSERT OR IGNORE INTO news_articles
                (article_id, title, content, source, publication_date, category, url)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                article_id, title, content, publisher,
                _pick(row, "publication_date"), category, url,
            ))
            if cur.rowcount:
                inserted += 1
            else:
                skip_dup += 1

    conn.commit()
    cur.execute("SELECT COUNT(*) FROM news_articles")
    total = cur.fetchone()[0]
    cur.execute("""
        SELECT source, COUNT(*) FROM news_articles
        WHERE source <> '' GROUP BY source ORDER BY COUNT(*) DESC LIMIT 10
    """)
    sources = cur.fetchall()
    conn.close()

    print(f"\n[OK] Imported {inserted} new articles.")
    print(f"     Skipped: {skip_id} no-id, {skip_title} no-title, "
          f"{skip_content} short-content, {skip_source} no-source, "
          f"{skip_dup} duplicate")
    print(f"     Total in DB: {total}")
    if sources:
        print("[i] Publishers now in the database:")
        for src, cnt in sources:
            print(f"    {src}  ({cnt})")


if __name__ == "__main__":
    import_news()