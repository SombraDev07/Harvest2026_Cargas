import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://harvest_user:harvest_pass@db:5432/harvest_db")

def migrate():
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        print("Checking for 'error_type' column in 'registered_loads'...")
        try:
            # Check if column exists
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='registered_loads' AND column_name='error_type';
            """))
            
            if not result.fetchone():
                print("Adding column 'error_type' to 'registered_loads'...")
                conn.execute(text("ALTER TABLE registered_loads ADD COLUMN error_type VARCHAR;"))
                conn.execute(text("CREATE INDEX ix_registered_loads_error_type ON registered_loads (error_type);"))
                conn.commit()
                print("Column added successfully!")
            else:
                print("Column already exists. Skipping.")
        except Exception as e:
            print(f"Error during migration: {e}")

if __name__ == "__main__":
    migrate()
