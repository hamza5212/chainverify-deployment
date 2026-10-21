"""Single source of truth for publisher names and domains.

Every place that shows, compares or stores a publisher name goes through
canonical_publisher(), so "CNN", "Cnn", " cnn " and "cnn\u00a0" are one publisher.
"""
import re
import unicodedata

# canonical display name -> (allowed domains, accepted aliases)
PUBLISHERS = {
    "CNN":              (("cnn.com",), ["cnn", "cnn international", "cnn news"]),
    "BBC":              (("bbc.com", "bbc.co.uk"), ["bbc", "bbc news"]),
    "Reuters":          (("reuters.com",), ["reuters", "reuters.com"]),
    "Associated Press": (("apnews.com",), ["associated press", "ap", "ap news", "the associated press"]),
    "PTI":              (("ptinews.com",), ["pti", "press trust of india"]),
    "The Hindu":        (("thehindu.com",), ["the hindu"]),
    "Indian Express":   (("indianexpress.com",), ["indian express", "the indian express"]),
    "Hindustan Times":  (("hindustantimes.com",), ["hindustan times"]),
    "Times of India":   (("timesofindia.indiatimes.com",), ["times of india", "the times of india"]),
    "ANI":              (("aninews.in",), ["ani", "ani news"]),
    "The Wire":         (("thewire.in",), ["the wire"]),
}


def _key(name) -> str:
    s = unicodedata.normalize("NFKC", str(name or ""))
    s = s.replace("\u00a0", " ")            # SQLite TRIM() does not remove these
    return re.sub(r"\s+", " ", s).strip().casefold()


_ALIAS = {}
for _canon, (_domains, _aliases) in PUBLISHERS.items():
    _ALIAS[_key(_canon)] = _canon
    for _a in _aliases:
        _ALIAS[_key(_a)] = _canon


def canonical_publisher(name) -> str:
    """Return the one display name for a publisher ('' if empty)."""
    k = _key(name)
    if not k:
        return ""
    if k in _ALIAS:
        return _ALIAS[k]
    raw = re.sub(r"\s+", " ", str(name).replace("\u00a0", " ")).strip()
    return raw.title() if (raw.islower() or raw.isupper()) else raw


def is_trusted(name) -> bool:
    return canonical_publisher(name) in PUBLISHERS


def same_publisher(a, b) -> bool:
    ca, cb = canonical_publisher(a), canonical_publisher(b)
    return bool(ca) and ca == cb


def publisher_domains(name) -> tuple:
    return PUBLISHERS.get(canonical_publisher(name), ((), []))[0]


def host_matches(host: str, domains) -> bool:
    """True only for the domain itself or a real sub-domain.

    'evilreuters.com'.endswith('reuters.com') is True, so a plain endswith()
    is NOT safe. We require an exact match or a leading dot.
    """
    host = (host or "").lower().rstrip(".")
    return any(host == d or host.endswith("." + d) for d in domains)


def trusted_list():
    return [{"name": n, "domain": d[0]} for n, (d, _) in sorted(PUBLISHERS.items())]