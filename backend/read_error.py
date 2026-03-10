import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from database import SessionLocal
import models

def print_err():
    db = SessionLocal()
    try:
        err = db.query(models.SystemConfig).filter(models.SystemConfig.key == "last_validation_error").first()
        if err:
            print("ERROR DUMP:", err.value)
        else:
            print("NO ERROR IN DB!")
    finally:
        db.close()

if __name__ == "__main__":
    print_err()
