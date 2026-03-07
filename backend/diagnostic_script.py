
import sqlite3
import json

def check_one_id():
    conn = sqlite3.connect('harvest.db')
    cursor = conn.cursor()
    
    target_id = '2955191'
    cursor.execute("SELECT * FROM loads WHERE load_identifier = ?", (target_id,))
    columns = [description[0] for description in cursor.description]
    row = cursor.fetchone()
    
    result = {}
    if row:
        result['load'] = dict(zip(columns, row))
        
        cursor.execute("SELECT * FROM error_ledger WHERE load_identifier = ?", (target_id,))
        err_cols = [description[0] for description in cursor.description]
        err_rows = cursor.fetchall()
        result['errors'] = [dict(zip(err_cols, r)) for r in err_rows]
    else:
        result['error'] = 'Not found'
        
    with open('diagnostic_result.json', 'w') as f:
        json.dump(result, f, indent=4)
    
    conn.close()

if __name__ == "__main__":
    check_one_id()
