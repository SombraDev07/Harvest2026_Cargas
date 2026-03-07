import sqlite3
import os

db_path = "harvest.db"
if os.path.exists(db_path):
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 1. Check if column already exists
        cursor.execute("PRAGMA table_info(loads)")
        cols = [r[1] for r in cursor.fetchall()]
        if "updated_at" in cols:
            print("updated_at already exists.")
            conn.close()
            exit(0)

        # 2. Get the CREATE TABLE statement for the original table
        cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='loads'")
        original_sql = cursor.fetchone()[0]
        
        # 3. Rename old table
        cursor.execute("ALTER TABLE loads RENAME TO loads_old")
        
        # 4. Create new table (Hardcoded schema based on current models.py to be safe)
        cursor.execute("""
        CREATE TABLE loads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            load_identifier VARCHAR,
            truck_plate VARCHAR,
            product VARCHAR,
            district VARCHAR,
            visit_code VARCHAR DEFAULT 'N/A',
            doc_number VARCHAR DEFAULT 'N/A',
            city VARCHAR DEFAULT 'N/A',
            cnpj_filial VARCHAR DEFAULT 'N/A',
            rateio VARCHAR DEFAULT 'NÃO',
            technology VARCHAR DEFAULT 'N/A',
            load_time VARCHAR DEFAULT 'N/A',
            weight_gross FLOAT,
            weight_net FLOAT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR DEFAULT 'pending',
            error_message VARCHAR
        )
        """)
        
        # 5. Copy data (mapping columns explicitly)
        # Note: id, timestamp, and others map directly. updated_at will default to now for existing rows.
        cursor.execute("""
        INSERT INTO loads (
            id, load_identifier, truck_plate, product, district, 
            visit_code, doc_number, city, cnpj_filial, rateio, 
            technology, load_time, weight_gross, weight_net, 
            timestamp, status, error_message
        )
        SELECT 
            id, load_identifier, truck_plate, product, district, 
            visit_code, doc_number, city, cnpj_filial, rateio, 
            technology, load_time, weight_gross, weight_net, 
            timestamp, status, error_message
        FROM loads_old
        """)
        
        # 6. Re-create indexes
        cursor.execute("CREATE INDEX ix_loads_id ON loads (id)")
        cursor.execute("CREATE INDEX ix_loads_load_identifier ON loads (load_identifier)")
        cursor.execute("CREATE INDEX ix_loads_truck_plate ON loads (truck_plate)")
        cursor.execute("CREATE INDEX ix_loads_district ON loads (district)")
        cursor.execute("CREATE INDEX ix_loads_status ON loads (status)")

        # 7. Drop old table
        cursor.execute("DROP TABLE loads_old")
        
        conn.commit()
        conn.close()
        print("SUCCESS: loads table recreated with updated_at column.")
    except Exception as e:
        print(f"ERROR: {e}")
        if conn: conn.rollback()
else:
    print(f"Database {db_path} not found.")
