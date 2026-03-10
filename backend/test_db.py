import os
import sys

# Add the current directory to sys.path if not there
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from database import engine

def main():
    print(f"DATABASE_URL: {os.getenv('DATABASE_URL', 'Not set (Defaulting to sqlite:///./harvest.db)')}")
    try:
        with engine.connect() as conn:
            from sqlalchemy import text
            conn.execute(text("SELECT 1"))
            print("✅ CONNECTION SUCCESS: Successfully connected to the database!")
    except Exception as e:
        print(f"❌ CONNECTION FAILED: {e}")

if __name__ == "__main__":
    main()
