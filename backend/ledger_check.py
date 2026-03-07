
import sqlite3
import json

def check_ledger_types():
    conn = sqlite3.connect('harvest.db')
    cursor = conn.cursor()
    
    cursor.execute("SELECT error_type, COUNT(*) FROM error_ledger GROUP BY error_type")
    counts = cursor.fetchall()
    print(f"Error types in ledger: {counts}")
    
    cursor.execute("SELECT load_identifier, error_type, error_message FROM error_ledger WHERE load_identifier = '2955191'")
    details = cursor.fetchall()
    print(f"Details for 2955191: {details}")
    
    conn.close()

if __name__ == "__main__":
    check_ledger_types()
