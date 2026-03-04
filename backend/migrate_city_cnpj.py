import sqlite3

def migrate():
    conn = sqlite3.connect('harvest.db')
    cursor = conn.cursor()
    
    print("Migrating: Adding 'city' and 'cnpj_filial' to 'loads' table...")
    
    try:
        cursor.execute("ALTER TABLE loads ADD COLUMN city TEXT")
        print("Success: Added 'city' column.")
    except sqlite3.OperationalError:
        print("Column 'city' already exists.")

    try:
        cursor.execute("ALTER TABLE loads ADD COLUMN cnpj_filial TEXT")
        print("Success: Added 'cnpj_filial' column.")
    except sqlite3.OperationalError:
        print("Column 'cnpj_filial' already exists.")
        
    conn.commit()
    conn.close()
    print("Migration finished successfully.")

if __name__ == "__main__":
    migrate()
