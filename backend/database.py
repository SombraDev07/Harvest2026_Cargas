from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
import os

# Connection to Supabase Pooled (Transaction Mode)
# Note: Host suffix for pooler is .com, while direct is .co
DEFAULT_DB = "postgresql://postgres.dipbhkolyebdbrvjrjdwu:Azdomal123***@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DB)

# Use NullPool when connecting to a server-side pooler like Supabase Transaction Pooler
engine = create_engine(
    DATABASE_URL, 
    poolclass=NullPool,
    connect_args={
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    }
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
