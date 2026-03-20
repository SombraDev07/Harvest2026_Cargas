from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Connection to Supabase
# Using Direct Connection for stability during testing
# Connection to Supabase Pooled (Transaction Mode)
DEFAULT_DB = "postgresql://postgres.dipbhkolyebdbrvjrjdwu:Azdomal123***@aws-0-sa-east-1.pooler.supabase.co:6543/postgres?sslmode=require"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DB)

# Standard Postgres engine with pooling
engine = create_engine(
    DATABASE_URL, 
    pool_size=5, 
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=300
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
