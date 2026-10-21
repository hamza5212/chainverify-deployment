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
| GET | `/health` | Check backend status |
| GET | `/stats` | Retrieve project statistics |
| GET | `/analytics` | Retrieve dashboard data |
| GET | `/news` | List and search articles |
| GET | `/news/<id>` | Retrieve a full article |
| POST | `/auth/register` | Register a user |
| POST | `/auth/login` | Log in |
| POST | `/auth/logout` | Log out |
| POST | `/register/prepare` | Prepare an article registration |
| POST | `/register/confirm` | Confirm an article registration |
| POST | `/verify` | Verify submitted content |
| GET | `/chain` | Retrieve ledger records |
| GET | `/chain/validate` | Validate the ledger |
| GET | `/trusted-sources` | Retrieve trusted publishers |
| POST | `/articles/add` | Add an article from a trusted publisher |

---

## Limitations

- Simulated, centralized ledger stored in SQLite
- No distributed blockchain consensus for the SQLite ledger
- No factual fact-checking
- Zero-width watermarks can be removed
- Verification depends on registered content and normalization rules
- Not benchmarked at scale

---

## Contributors

- Taher Saterdawala
- Hamza Selanawala
- Gautham Seshapalli
- Ayush Shetty

---

## License

This project is licensed under the MIT License.
