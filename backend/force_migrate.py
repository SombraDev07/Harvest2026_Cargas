import sqlite3
import os

db_path = "harvest.db"
if os.path.exists(db_path):
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        # SQL with default value to avoid NULL issues
        cursor.execute("ALTER TABLE loads ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP")
        conn.commit()
        conn.close()
        print("SUCCESS: added updated_at column to 'loads'")
    except Exception as e:
        print(f"ERROR: {e}")
else:
    print(f"Database {db_path} not found.")
