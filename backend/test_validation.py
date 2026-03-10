import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from database import SessionLocal, engine
import validation
import traceback

import main
import models

def test():
    models.Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        print("Starting batch validation manually...")
        res = validation.run_batch_validation(db)
        print("RESULT:")
        print(res)
    except Exception as e:
        print("CRASHED!")
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test()
