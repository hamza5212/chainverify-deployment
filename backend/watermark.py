"""Text watermarking + hashing utilities for ChainVerify."""
import hashlib
import re
import unicodedata

ZW_CHARS = {'0': '\u200b', '1': '\u200c'}          # zero-width space / non-joiner
ZW_REGEX = re.compile(r'[\u200b\u200c\u200d\u2060\ufeff]')
VISIBLE = {'\u200b': '\u00b7', '\u200c': '\u25aa'}   # 0 -> '·'   1 -> '▪'


def normalize_text(text: str) -> str:
    """NFKC + strip zero-width chars + lowercase + collapse whitespace.

    NOTE: lowercasing means a change that only alters letter case is NOT
    detected. This is kept so hashes of already-registered articles stay valid.
    """
    if text is None:
        return ""
    text = unicodedata.normalize("NFKC", str(text))
    text = ZW_REGEX.sub("", text).lower()
    return re.sub(r"\s+", " ", text).strip()


def generate_sha256(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def generate_watermark_id(article_id: str, content_hash: str) -> str:
    """Deterministic: prepare, confirm, SQLite and the contract all get the SAME id."""
    return f"CV-{article_id}-{content_hash[:8]}"


def _to_bits(s: str) -> str:
    return "".join(format(b, "08b") for b in s.encode("utf-8"))


def _from_bits(bits: str) -> str:
    data = bytes(int(bits[i:i + 8], 2) for i in range(0, len(bits) - len(bits) % 8, 8))
    return data.decode("utf-8")


def embed_watermark(text: str, watermark_id: str) -> str:
    hidden = "".join(ZW_CHARS[b] for b in _to_bits(watermark_id))
    parts = (text or "").split(" ", 1)
    if len(parts) == 1:
        return (text or "") + hidden
    return parts[0] + hidden + " " + parts[1]


def extract_watermark(text: str) -> str:
    inv = {v: k for k, v in ZW_CHARS.items()}
    bits = "".join(inv[c] for c in (text or "") if c in inv)
    if not bits or len(bits) % 8 != 0:
        return ""
    try:
        return _from_bits(bits)
    except Exception:
        return ""


def make_visible(text: str, limit: int = 400) -> str:
    """Replace the invisible characters by '·' (0) and '▪' (1) so they can be seen."""
    return "".join(VISIBLE.get(c, c) for c in (text or ""))[:limit]


def remove_watermark(text: str) -> str:
    return ZW_REGEX.sub("", text or "")