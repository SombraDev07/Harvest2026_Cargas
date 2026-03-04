import sqlite3

def check():
    conn = sqlite3.connect('harvest.db')
    cursor = conn.cursor()
    cursor.execute("SELECT load_identifier, visit_code, city, cnpj_filial FROM loads LIMIT 5;")
    rows = cursor.fetchall()
    for row in rows:
        print(f"ID: {row[0]} | COD: {row[1]} | CITY: {row[2]} | CNPJ: {row[3]}")
    conn.close()

if __name__ == "__main__":
    check()
