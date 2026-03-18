import os
import sys
from sqlalchemy import create_engine, text

# Supabase Connection URI
DATABASE_URL = "postgresql://postgres.dipbhkolyebdbvrjedwu:Azdomal123***@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

def apply_sql():
    print("--- [SQL UPDATE] Connecting to Supabase... ---")
    engine = create_engine(DATABASE_URL)
    
    files = ["validation_procedure.sql"]
    
    try:
        with engine.connect() as conn:
            for sql_file in files:
                print(f"--- [SQL UPDATE] Reading {sql_file}... ---")
                with open(sql_file, "r") as f:
                    sql_content = f.read()
                
                print(f"--- [SQL UPDATE] Updating procedure... ---")
                # Stored procedures are one single statement generally, but can have comments.
                # Here we execute the whole file as one text block.
                conn.execute(text(sql_content))
                conn.commit()
                print(f"--- [SQL UPDATE] {sql_file} applied successfully! ---")
            
    except Exception as e:
        print(f"--- [SQL UPDATE] FAILED: {str(e)} ---")
        sys.exit(1)

if __name__ == "__main__":
    apply_sql()
