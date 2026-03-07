import models
from database import SessionLocal

db = SessionLocal()

print("--- DB STATUS ---")
total = db.query(models.Load).count()
validated = db.query(models.Load).filter(models.Load.status == "validated").count()
pending = db.query(models.Load).filter(models.Load.status == "pending").count()
errors = db.query(models.Load).filter(models.Load.status == "error").count()

print(f"Total Loads: {total}")
print(f"Validated: {validated}")
print(f"Pending: {pending}")
print(f"Errors (Status): {errors}")

ledger_total = db.query(models.ErrorLedger).count()
print(f"Error Ledger Total: {ledger_total}")

# Breakdown by type in Ledger
from sqlalchemy import func
breakdown = db.query(models.ErrorLedger.error_type, func.count(models.ErrorLedger.id)).group_by(models.ErrorLedger.error_type).all()
print("\n--- LEDGER BREAKDOWN ---")
for etype, count in breakdown:
    print(f"{etype}: {count}")

db.close()
