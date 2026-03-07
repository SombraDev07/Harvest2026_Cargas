from database import engine, Base
import models

# Explicitly drop only the problematic table
models.RegisteredLoad.__table__.drop(engine, checkfirst=True)
print("Dropped 'registered_loads' table (if it existed).")

# Re-create all tables (only missing ones will be created)
Base.metadata.create_all(bind=engine)
print("Re-created tables with current models.")
