from database import engine, Base
import models
from sqlalchemy import text

# Add the column manually to avoid dropping everything
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE loads ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP"))
        print("Success: added updated_at to 'loads'")
except Exception as e:
    print(f"Error or already exists: {e}")

# Also ensure onupdate logic works by re-running create_all (it won't overwrite, but safe)
Base.metadata.create_all(bind=engine)
