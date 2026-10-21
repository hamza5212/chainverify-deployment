"""Simulated blockchain / linked ledger over SQLite.

This is a hash-linked table, NOT a distributed blockchain: anyone with write
access to the .db file could rebuild it. The real on-chain record is the
Hardhat smart contract (blockchain/contracts/ChainVerify.sol).
"""
import hashlib
import json
from datetime import datetime, timezone

from .database import get_connection

GENESIS_PREV_HASH = "0" * 64
_COLS = ("block_index", "timestamp", "article_id", "title", "source", "content_hash",
         "watermark_id", "watermark_status", "previous_hash", "block_hash")


def _compute_block_hash(block: dict) -> str:
    # watermark_id is intentionally NOT in this payload (changing it would
    # invalidate every existing block). validate_chain() cross-checks it instead.
    payload = {
        "index": block["block_index"], "timestamp": block["timestamp"],
        "article_id": block["article_id"], "title": block["title"],
        "source": block["source"], "content_hash": block["content_hash"],
        "watermark_status": block["watermark_status"], "previous_hash": block["previous_hash"],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def _insert(conn, block: dict) -> None:
    conn.execute(f"INSERT INTO blockchain_blocks ({', '.join(_COLS)}) VALUES ({', '.join('?' * len(_COLS))})",
                 tuple(block[c] for c in _COLS))


def create_genesis_block():
    conn = get_connection()
    try:
        if conn.execute("SELECT 1 FROM blockchain_blocks WHERE block_index = 0").fetchone():
            return None
        block = {"block_index": 0, "timestamp": datetime.now(timezone.utc).isoformat(),
                 "article_id": "GENESIS", "title": "Genesis Block", "source": "ChainVerify",
                 "content_hash": GENESIS_PREV_HASH, "watermark_id": "", "watermark_status": "none",
                 "previous_hash": GENESIS_PREV_HASH}
        block["block_hash"] = _compute_block_hash(block)
        _insert(conn, block)
        conn.commit()
        return block
    finally:
        conn.close()


def get_last_block():
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM blockchain_blocks ORDER BY block_index DESC LIMIT 1").fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_chain():
    conn = get_connection()
    try:
        return [dict(r) for r in conn.execute("SELECT * FROM blockchain_blocks ORDER BY block_index ASC")]
    finally:
        conn.close()


def add_block(*, article_id, title, source, content_hash, watermark_id, watermark_status, conn=None):
    """Append one block.

    Pass `conn` (inside BEGIN IMMEDIATE) to make the block part of the caller's
    transaction, so a failure later rolls the block back too (no orphan blocks).
    """
    own = conn is None
    if own:
        conn = get_connection()
        conn.execute("BEGIN IMMEDIATE")
    try:
        last = conn.execute("SELECT * FROM blockchain_blocks ORDER BY block_index DESC LIMIT 1").fetchone()
        if last is None:
            raise RuntimeError("Genesis block is missing; run create_genesis_block() first.")
        block = {"block_index": last["block_index"] + 1,
                 "timestamp": datetime.now(timezone.utc).isoformat(),
                 "article_id": article_id, "title": title, "source": source,
                 "content_hash": content_hash, "watermark_id": watermark_id,
                 "watermark_status": watermark_status, "previous_hash": last["block_hash"]}
        block["block_hash"] = _compute_block_hash(block)
        _insert(conn, block)
        if own:
            conn.commit()
        return block
    except Exception:
        if own:
            conn.rollback()
        raise
    finally:
        if own:
            conn.close()


def validate_chain():
    """Check (1) hash links, (2) block hashes, (3) every block matches its registry row."""
    chain = get_chain()
    conn = get_connection()
    try:
        reg = {r["block_index"]: r for r in conn.execute(
            "SELECT article_id, content_hash, watermark_id, block_index FROM registered_articles "
            "WHERE block_index IS NOT NULL")}
    finally:
        conn.close()

    issues = []
    def bad(blk, msg):
        issues.append({"block_index": blk["block_index"], "problem": msg})

    for i, blk in enumerate(chain):
        if blk["block_index"] != i:
            bad(blk, "block_index is not contiguous")
        if _compute_block_hash(blk) != blk["block_hash"]:
            bad(blk, "block_hash mismatch (block contents were changed)")
        if i == 0 and blk["previous_hash"] != GENESIS_PREV_HASH:
            bad(blk, "genesis previous_hash is wrong")
        if i > 0:
            if blk["previous_hash"] != chain[i - 1]["block_hash"]:
                bad(blk, "previous_hash does not match previous block")
            r = reg.get(blk["block_index"])
            if r is None:
                bad(blk, "no registered article points to this block")
            else:
                for field in ("article_id", "content_hash", "watermark_id"):
                    if (r[field] or "") != (blk[field] or ""):
                        bad(blk, f"{field} differs between ledger block and registry")
    known = {b["block_index"] for b in chain}
    for idx in reg:
        if idx not in known:
            issues.append({"block_index": idx, "problem": "registered article points to a missing block"})
    return {"valid": not issues, "blocks_checked": len(chain), "issues": issues}