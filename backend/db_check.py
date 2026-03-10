import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from database import SessionLocal
import models

def print_counts():
    db = SessionLocal()
    try:
        total = db.query(models.Load).count()
        validated = db.query(models.Load).filter(models.Load.status == "validated").count()
        errs = db.query(models.Load).filter(models.Load.status == "error").count()
        pending = db.query(models.Load).filter(models.Load.status == "pending").count()
        cfg = db.query(models.SystemConfig).filter(models.SystemConfig.key == "is_processing").first()
        
        print("====== STATUS DO BANCO DE DADOS AWS ======")
        print(f"-> Total de Cargas na Tabela (models.Load): {total}")
        print(f"-> Cargas Validadas: {validated}")
        print(f"-> Cargas Pendentes: {pending}")
        print(f"-> Cargas Com Erro: {errs}")
        print(f"-> Sistema Processando (is_processing): {cfg.value if cfg else 'N/A'}")
        
        if total > 0:
            sample = db.query(models.Load).first()
            if sample:
                print(f"-> Exemplo ID inserido: {sample.load_identifier} ({sample.district})")
    finally:
        db.close()

if __name__ == "__main__":
    print_counts()
