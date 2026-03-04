import pandas as pd
import numpy as np
import os

def generate_mock_spreadsheet(filename="harvest_500k.csv", rows=500000):
    print(f"Gerando planilha fake com {rows} linhas...")
    
    data = {
        'ID': [f"L2026-{i:06d}" for i in range(rows)],
        'Placa': [f"ABC{np.random.randint(1000, 9999)}" for _ in range(rows)],
        'Produto': np.random.choice(['Soja', 'Milho', 'Algodão', 'Trigo'], rows),
        'Peso Bruto': np.random.uniform(30, 45, rows),
        'Peso Liquido': np.random.uniform(25, 29, rows),
    }
    
    # Introduce some errors for validation testing
    # 5% of rows will have gross weight < net weight
    error_indices = np.random.choice(rows, int(rows * 0.05), replace=False)
    for idx in error_indices:
        data['Peso Bruto'][idx] = data['Peso Liquido'][idx] - 2

    df = pd.DataFrame(data)
    df.to_csv(filename, index=False)
    print(f"Planilha salva em: {filename}")

if __name__ == "__main__":
    generate_mock_spreadsheet("c:/Users/Bruno/Documentos/Harvest2026_Cargas/backend/harvest_sample_500k.csv", rows=10000) # Small sample for dev
