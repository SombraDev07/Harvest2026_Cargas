import sqlite3
import os

db_path = "harvest.db"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(loads)")
    columns = [row[1] for row in cursor.fetchall()]
    conn.close()
    print(f"Columns in 'loads': {columns}")
    if "updated_at" in columns:
        print("SUCCESS: updated_at column found.")
    else:
        print("FAILURE: updated_at column MISSING.")
else:
    print(f"Database {db_path} not found.")
