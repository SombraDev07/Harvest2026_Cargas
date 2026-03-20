from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Connection to Supabase
# Using Direct Connection for stability during testing
DEFAULT_DB = "postgresql://postgres:Azdomal123***@db.dipbhkolyebdbrvjrjdwu.supabase.co:5432/postgres?sslmode=require"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DB)

# Standard Postgres engine with pooling
engine = create_engine(
    DATABASE_URL, 
    pool_size=10, 
    max_overflow=20,
    pool_pre_ping=True
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
