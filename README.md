# ChainVerify

Blockchain-Based News Authenticity and Verification System.

Verifies the integrity and provenance of registered digital news using
text watermarking, SHA-256 hashing and a simulated linked blockchain
persisted in SQLite.

> **ChainVerify does NOT detect fake news.** It verifies whether submitted
> content matches a previously registered version. It does not determine
> whether the news is factually true.

---

## Architecture

```
Dataset (CSV)  →  SQLite (news_articles)
                     ↓
               User picks an article
                     ↓
            Text normalization (Unicode NFKC, lowercase)
                     ↓
            Zero-width Unicode watermark embedded
                     ↓
              SHA-256 hash of the normalized text
                     ↓
        Block appended to simulated blockchain
                     ↓
          Verify → hash compare → MATCH / NO MATCH
```

| Layer | Role |
|-------|------|
| SQLite | Persistent storage for articles, registrations and blocks |
| Watermark | Hidden zero-width Unicode ID for provenance |
| SHA-256 | Compact fingerprint of the normalized visible text |
| Blockchain | Linked blocks: each holds the previous block's hash |
| Flask | REST API for the frontend |
| React + Vite | Browser interface |

---

## Requirements

- Python 3.10+
- Node.js 18+

---

## Setup (Windows)

```cmd
cd path\to\chainverify
python -m venv venv
venv\Scripts\activate
pip install -r backend\requirements.txt
python init_db.py
python import_news.py
python -m backend.app
```

New terminal:

```cmd
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

---

## API

| Method | Route | Purpose |
|--------|-------|---------|
| GET  | `/health` | Status check |
| GET  | `/stats` | Counts |
| GET  | `/analytics` | Home dashboard data |
| GET  | `/news` | List / search articles |
| GET  | `/news/<id>` | Full article |
| POST | `/register` | Register one article |
| POST | `/register-all` | Register all unregistered |
| POST | `/verify` | Verify by `article_id` OR `content` |
| GET  | `/chain` | Full chain |
| GET  | `/chain/validate` | Validate links |
| GET  | `/trusted-sources` | Publisher whitelist |
| POST | `/articles/add` | Add an article from a trusted publisher |

---

## Limitations

- Simulated, centralised ledger
- Local SQLite only
- No publisher identity
- No factual fact-checking
- Zero-width watermark can be stripped
- Not benchmarked at scale

---

## Licence

MIT.