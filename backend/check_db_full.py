from sqlalchemy import inspect
from database import engine

inspector = inspect(engine)
columns = inspector.get_columns('registered_loads')
print("Full Columns in 'registered_loads':")
for col in columns:
    print(f" - {col['name']} ({col['type']})")
