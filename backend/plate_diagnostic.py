
import sqlite3
import json

def check_plate_group():
    conn = sqlite3.connect('harvest.db')
    cursor = conn.cursor()
    
    plate = 'IXQ-5J34' # From screenshot ID 2955191
    cursor.execute("SELECT load_identifier, truck_plate, rateio, technology, load_time, weight_gross, weight_net, error_message FROM loads WHERE truck_plate = ? ORDER BY load_time", (plate,))
    rows = cursor.fetchall()
    
    result = []
    for r in rows:
        result.append({
            'ident': r[0],
            'plate': r[1],
            'rateio': r[2],
            'tech': r[3],
            'time': r[4],
            'pl': r[5],
            'plcd': r[6],
            'err': r[7]
        })
        
    with open('plate_diagnostic_IXQ5J34.json', 'w') as f:
        json.dump(result, f, indent=4)
    
    conn.close()

if __name__ == "__main__":
    check_plate_group()
