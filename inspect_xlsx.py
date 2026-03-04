import pandas as pd

file_path = r"c:\Users\Bruno\Documentos\Harvest2026_Cargas\relatorios_relatorio_acompanhamento_cargas_20260303143358.xlsx"
out_path = r"c:\Users\Bruno\Documentos\Harvest2026_Cargas\inspection_log.txt"

with open(out_path, "w", encoding="utf-8") as f:
    try:
        df = pd.read_excel(file_path, header=1, nrows=3)
        f.write("--- HEADERS ---\n")
        f.write(str(df.columns.tolist()) + "\n\n")
        
        f.write("--- FIRST ROW FULL DATA ---\n")
        row_dict = df.iloc[0].to_dict()
        for k, v in row_dict.items():
            f.write(f"[{k}] = {v} (Type: {type(v)})\n")
            
        f.write("\n--- ALL COLUMN TYPES ---\n")
        f.write(str(df.dtypes) + "\n")
                
    except Exception as e:
        f.write(f"ERROR: {e}\n")
