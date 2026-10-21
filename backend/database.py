"""SQLite persistence layer for ChainVerify."""
import shutil
import sqlite3
import os
from datetime import datetime
from pathlib import Path

DB_PATH = Path(
    os.environ.get(
        "DATABASE_PATH",
        str(Path(__file__).resolve().parent.parent / "database" / "chainverify.db")
    )
)


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15) # <-- Add timeout=15
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 15000") # <-- Add busy_timeout
    return conn


def backup_database() -> Path:
    """Copy the DB file next to itself with a timestamp. Call before any bulk UPDATE."""
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = DB_PATH.with_name(f"{DB_PATH.stem}.backup-{stamp}{DB_PATH.suffix}")
    shutil.copy2(DB_PATH, target)
    return target


def init_db() -> None:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS news_articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT, article_id TEXT UNIQUE NOT NULL,
        title TEXT, content TEXT, source TEXT, publication_date TEXT, category TEXT,
        url TEXT UNIQUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    cur.execute("""CREATE TABLE IF NOT EXISTS registered_articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT, article_id TEXT UNIQUE NOT NULL, title TEXT,
        normalized_content TEXT, watermarked_content TEXT, content_hash TEXT NOT NULL,
        watermark_id TEXT, watermark_status TEXT DEFAULT 'embedded', block_index INTEGER,
        registered_by TEXT, tx_hash TEXT, onchain_block INTEGER,
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (article_id) REFERENCES news_articles(article_id))""")
    cur.execute("""CREATE TABLE IF NOT EXISTS blockchain_blocks (
        block_index INTEGER PRIMARY KEY, timestamp TEXT, article_id TEXT, title TEXT,
        source TEXT, content_hash TEXT, watermark_id TEXT, watermark_status TEXT,
        previous_hash TEXT, block_hash TEXT)""")
    cur.execute("""CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('publisher','user')),
        publisher_source TEXT, publisher_id TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    cur.execute("""CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, expires_at TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)""")
    # Non-destructive speed-ups (IF NOT EXISTS)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_reg_hash ON registered_articles(content_hash)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_reg_block ON registered_articles(block_index)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_news_source ON news_articles(source)")
    conn.commit()
    conn.close()
