from backend.database import init_db
from backend import blockchain

if __name__ == "__main__":
    init_db()
    created = blockchain.create_genesis_block()
    print("Database initialised." if created else "Database already initialised.")