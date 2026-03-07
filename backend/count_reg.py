from database import SessionLocal
import models

db = SessionLocal()
count = db.query(models.Base.metadata.tables['registered_loads']).count()
print(f"Total rows in 'registered_loads': {count}")
db.close()
