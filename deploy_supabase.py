import os
import sys
from sqlalchemy import create_engine, text

# Supabase Connection URI
# FORMAT: postgresql://postgres.[REF]:[PASSWORD]@[HOST]:[PORT]/[DB]
DATABASE_URL = "postgresql://postgres.dipbhkolyebdbvrjedwu:Azdomal123***@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

print("--- [MIGRATION] Connecting to Supabase... ---")
engine = create_engine(DATABASE_URL)

try:
    with engine.connect() as conn:
        print("--- [MIGRATION] Connected! Testing connection... ---")
        res = conn.execute(text("SELECT now()"))
        print(f"Server time: {res.fetchone()[0]}")
        
        print("--- [MIGRATION] Reading schema_supabase.sql... ---")
        with open("schema_supabase.sql", "r") as f:
            sql_content = f.read()
        
        print("--- [MIGRATION] Executing SQL commands... ---")
        # Split by ';' to execute block by block if needed, but here we try raw
        # sqlalchemy doesn't support executing entire script files easily if they contain 'CREATE EXTENSION' and multiple commands
        # so we execute as one block using text().execution_options(autocommit=True)
        # Note: If it fails, we might need to split by '--' or separate statements.
        
        # Simple split logic for multi-statement execution
        statements = sql_content.split(';')
        for statement in statements:
            if statement.strip():
                conn.execute(text(statement.strip()))
                print(".")
        
        conn.commit()
        print("\n--- [MIGRATION] SUCCESS! Schema deployed to Supabase. ---")
        
        print("--- [MIGRATION] Verifying tables... ---")
        verify = conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"))
        for row in verify:
            print(f"Table found: {row[0]}")

except Exception as e:
    print(f"--- [MIGRATION] FAILED: {str(e)} ---")
    sys.exit(1)
