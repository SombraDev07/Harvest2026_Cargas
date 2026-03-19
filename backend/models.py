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
    technology = Column(String) # Col AF: TECNOLOGIA
    load_time = Column(String) # Col S/T: HORA DA CARGA
    weight_gross = Column(Float)
    weight_net = Column(Float)
    timestamp = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now()) # Arrival tracking (Only updated on Import/Upload)
    status = Column(String, default="pending", index=True) # pending, validated, error
    error_message = Column(String, nullable=True)
    is_urgent = Column(Boolean, default=False, index=True)
    arrival_at = Column(DateTime, nullable=True, index=True)

class ValidatedLoad(Base):
    __tablename__ = "validated_loads"

    id = Column(Integer, primary_key=True, index=True)
    load_id = Column(Integer, ForeignKey("loads.id"))
    validation_timestamp = Column(DateTime, default=func.now())
    validated_by = Column(String, default="system")

class ErrorLedger(Base):
    __tablename__ = "error_ledger"

    id = Column(Integer, primary_key=True, index=True)
    load_identifier = Column(String, index=True) # Uniquely identifies the original load doc
    district = Column(String, index=True)
    error_type = Column(String, index=True) # e.g., 'rateio', 'duplicate', 'weight'
    error_message = Column(String)
    occurred_at = Column(DateTime, default=func.now())

class TableAnalysis(Base):
    __tablename__ = "table_analysis"

    id = Column(Integer, primary_key=True, index=True)
    rule_filter = Column(String, unique=True, index=True) # e.g., 'duplicado'
    user_name = Column(String)
    started_at = Column(DateTime, default=func.now())

class RegisteredLoad(Base):
    __tablename__ = "registered_loads"

    id = Column(Integer, primary_key=True, index=True)
    visit_code = Column(String, index=True) # COD
    load_identifier = Column(String, index=True) # ID
    error_type = Column(String, index=True, nullable=True) # e.g., 'duplicado', 'placa'
    column_name = Column(String, index=True) # Column where error was found (formerly table_name)
    user_name = Column(String) # USUÁRIO
    reason = Column(String) # MOTIVO
    timestamp = Column(DateTime, default=func.now())

class OperationLog(Base):
    __tablename__ = "operation_log"

    id = Column(Integer, primary_key=True, index=True)
    visit_code = Column(String, index=True) # COD
    load_identifier = Column(String, index=True) # Added to fix analytics error
    timestamp = Column(DateTime, default=func.now())

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    name = Column(String) # For display/tracking
    password_hash = Column(String)
    role = Column(String, default="user") # 'admin' for BrunoHarvest2026

class KnownID(Base):
    __tablename__ = "known_ids"

    id = Column(Integer, primary_key=True, index=True)
    load_identifier = Column(String, unique=True, index=True)
    registered_at = Column(DateTime, default=func.now())

class SystemConfig(Base):
    __tablename__ = "system_config"

    key = Column(String, primary_key=True, index=True)
    value = Column(String)
