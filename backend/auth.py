"""Authentication & authorization for ChainVerify."""
import secrets
import re
import string
import hashlib
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash

from .database import get_connection

SESSION_DAYS = 7

PUBLISHER_IDS = {
    "ANI-X7K9P2": {"source": "ani", "domain": "aninews.in"},
    "HT-M4Q8R1":  {"source": "hindustan times", "domain": "hindustantimes.com"},
    "TOI-B2F5L9": {"source": "times of india", "domain": "timesofindia.indiatimes.com"},
    "CNN-W3V8N4": {"source": "cnn", "domain": "cnn.com"},
    "BBC-T1Z6M5": {"source": "bbc", "domain": "bbc.com"},
    "REU-J9C4H7": {"source": "reuters", "domain": "reuters.com"},
    "PTI-D5G2S8": {"source": "pti", "domain": "ptinews.com"},
    "TH-K1Y7X3":  {"source": "the hindu", "domain": "thehindu.com"},
    "IE-P6R9F2":  {"source": "indian express", "domain": "indianexpress.com"},
    "TW-N8L4B1":  {"source": "the wire", "domain": "thewire.in"},
    "AP-V2M5J6":  {"source": "associated press", "domain": "apnews.com"},
}

def validate_email(email: str, role: str, code: str) -> str | None:
    email = email.lower()
    if role == 'user':
        if not email.endswith('@gmail.com'):
            return "Normal users must register with an @gmail.com address."
    elif role == 'publisher':
        code_info = PUBLISHER_IDS.get(code.upper().strip())
        if not code_info:
            return "Invalid Secret Publisher Key. Contact ChainVerify admin."
        
        domain = code_info["domain"]
        if not (email.endswith('@' + domain) or email.endswith('.' + domain)):
            return f"Your email must end with @{domain} to use this key."
    return None

def validate_password(password: str, email: str, publisher_source: str | None) -> str | None:
    if len(password) < 8: 
        return "Password must be at least 8 characters."
    if not re.search(r'[A-Z]', password): 
        return "Password must contain an uppercase letter."
    if not re.search(r'[a-z]', password): 
        return "Password must contain a lowercase letter."
    if not re.search(r'[0-9]', password): 
        return "Password must contain a number."
    if not re.search(r'[^A-Za-z0-9]', password): 
        return "Password must contain a special character."

    if re.search(r'(.)\1\1', password):
        return "Password cannot contain 3 repeating characters."

    pwd_lower = password.lower()
    for i in range(len(pwd_lower) - 2):
        chunk = pwd_lower[i:i+3]
        c1, c2, c3 = ord(chunk[0]), ord(chunk[1]), ord(chunk[2])
        
        if c2 == c1 + 1 and c3 == c2 + 1:
            return "Password cannot contain sequential characters (e.g., 'abc', '123')."
        if c2 == c1 - 1 and c3 == c2 - 1:
            return "Password cannot contain sequential characters (e.g., 'cba', '321')."

    return None

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

def hash_password(plain: str) -> str: return generate_password_hash(plain)
def verify_password(plain: str, hashed: str) -> bool:
    try: return check_password_hash(hashed, plain)
    except Exception: return False

def _make_token() -> str: return secrets.token_urlsafe(32)

def create_session(user_id: int) -> str:
    token = _make_token()
    token_hash = _hash_token(token)
    expires = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat()
    conn = get_connection(); cur = conn.cursor()
    cur.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", (token_hash, user_id, expires))
    conn.commit(); conn.close()
    return token

def delete_session(token: str) -> None:
    token_hash = _hash_token(token) # <-- MUST HASH BEFORE DELETE
    conn = get_connection(); cur = conn.cursor()
    cur.execute("DELETE FROM sessions WHERE token = ?", (token_hash,))
    conn.commit(); conn.close()

def _lookup_user_by_token(token: str):
    if not token: return None
    token_hash = _hash_token(token)
    conn = get_connection(); cur = conn.cursor()
    cur.execute("SELECT u.id, u.email, u.role, u.publisher_source, u.publisher_id, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?", (token_hash,))
    row = cur.fetchone(); conn.close()
    if not row: return None

    try:
        expires = datetime.fromisoformat(row["expires_at"])
        if expires < datetime.now(timezone.utc):
            delete_session(token); return None
    except Exception: pass

    return {"id": row["id"], "email": row["email"], "role": row["role"], "publisher_source": row["publisher_source"], "publisher_id": row["publisher_id"]}

def _extract_token() -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "): return auth[7:].strip()
    return ""

def require_auth(roles=None):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            token = _extract_token()
            user = _lookup_user_by_token(token)
            if user is None: return jsonify({"error": "Authentication required."}), 401
            if roles and user["role"] not in roles: return jsonify({"error": f"This action requires role: {', '.join(roles)}."}), 403
            request.user = user
            return fn(*args, **kwargs)
        return wrapper
    return decorator