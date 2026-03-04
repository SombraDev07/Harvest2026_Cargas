from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from database import Base

class Load(Base):
    __tablename__ = "loads"

    id = Column(Integer, primary_key=True, index=True)
    load_identifier = Column(String, index=True, unique=True) # ID from spreadsheet (Col N)
    truck_plate = Column(String, index=True)
    product = Column(String)
    district = Column(String, index=True) 
    visit_code = Column(String, index=True) # Col A: CÓDIGO VISITA
    doc_number = Column(String, index=True) # Col R: NÚMERO DOCUMENTO
    city = Column(String) # Col K: CIDADE FILIAL
    cnpj_filial = Column(String) # Col M: CNPJ FILIAL PDR
    rateio = Column(String) # Col AF: rateio (SIM/NÃO)
    weight_gross = Column(Float)
    weight_net = Column(Float)
    timestamp = Column(DateTime, default=func.now())
    status = Column(String, default="pending", index=True) # pending, validated, error
    error_message = Column(String, nullable=True)

class ValidatedLoad(Base):
    __tablename__ = "validated_loads"

    id = Column(Integer, primary_key=True, index=True)
    load_id = Column(Integer, ForeignKey("loads.id"))
    validation_timestamp = Column(DateTime, default=func.now())
    validated_by = Column(String, default="system")
