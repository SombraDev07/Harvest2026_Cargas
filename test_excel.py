import pandas as pd
import io
import sys
from rules.utils import normalize_str

def test_parse():
    filename = "relatorios_relatorio_acompanhamento_cargas_20260303143358.xlsx"
    try:
        print(f"Testing {filename}...")
        df = pd.read_excel(filename, engine='openpyxl')
        print(f"Success! Rows: {len(df)}")
        print("Columns found:")
        for c in df.columns:
            print(f" - {c} -> {normalize_str(str(c)).upper()}")
    except Exception as e:
        print(f"FAIL: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_parse()
