-- Exported Schema for Supabase Migration
-- Generated from backend/models.py

-- 1. Setup Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tables

-- Loads Table
CREATE TABLE IF NOT EXISTS loads (
    id SERIAL PRIMARY KEY,
    load_identifier TEXT UNIQUE,
    truck_plate TEXT,
    product TEXT,
    district TEXT,
    visit_code TEXT,
    doc_number TEXT,
    city TEXT,
    cnpj_filial TEXT,
    rateio TEXT,
    technology TEXT,
    load_time TEXT,
    weight_gross FLOAT8,
    weight_net FLOAT8,
    timestamp TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    is_urgent BOOLEAN DEFAULT FALSE,
    arrival_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_loads_identifier ON loads(load_identifier);
CREATE INDEX IF NOT EXISTS idx_loads_visit_code ON loads(visit_code);
CREATE INDEX IF NOT EXISTS idx_loads_district ON loads(district);
CREATE INDEX IF NOT EXISTS idx_loads_status ON loads(status);

-- Validated Loads
CREATE TABLE IF NOT EXISTS validated_loads (
    id SERIAL PRIMARY KEY,
    load_id INTEGER REFERENCES loads(id),
    validation_timestamp TIMESTAMPTZ DEFAULT now(),
    validated_by TEXT DEFAULT 'system'
);

-- Error Ledger (Source of Truth for errors)
CREATE TABLE IF NOT EXISTS error_ledger (
    id SERIAL PRIMARY KEY,
    load_identifier TEXT,
    district TEXT,
    error_type TEXT,
    error_message TEXT,
    occurred_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_ledger_identifier ON error_ledger(load_identifier);
CREATE INDEX IF NOT EXISTS idx_error_ledger_type ON error_ledger(error_type);

-- Table Analysis
CREATE TABLE IF NOT EXISTS table_analysis (
    id SERIAL PRIMARY KEY,
    rule_filter TEXT UNIQUE,
    user_name TEXT,
    started_at TIMESTAMPTZ DEFAULT now()
);

-- Registered Loads (User actions/overrides)
CREATE TABLE IF NOT EXISTS registered_loads (
    id SERIAL PRIMARY KEY,
    visit_code TEXT,
    load_identifier TEXT,
    error_type TEXT,
    column_name TEXT,
    user_name TEXT,
    reason TEXT,
    timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registered_loads_identifier ON registered_loads(load_identifier);

-- Operation Log
CREATE TABLE IF NOT EXISTS operation_log (
    id SERIAL PRIMARY KEY,
    visit_code TEXT,
    load_identifier TEXT,
    timestamp TIMESTAMPTZ DEFAULT now()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'user'
);

-- Known IDs (for tracking new/urgent loads)
CREATE TABLE IF NOT EXISTS known_ids (
    id SERIAL PRIMARY KEY,
    load_identifier TEXT UNIQUE,
    registered_at TIMESTAMPTZ DEFAULT now()
);

-- System Config
CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- 3. Staging Table (For massive 700k uploads)
-- All fields are text to ensure 'COPY' never fails due to formatting/types during raw import
CREATE TABLE IF NOT EXISTS staging_loads (
    raw_id SERIAL PRIMARY KEY,
    upload_id UUID DEFAULT uuid_generate_v4(),
    load_identifier TEXT,
    truck_plate TEXT,
    product TEXT,
    district TEXT,
    visit_code TEXT,
    doc_number TEXT,
    city TEXT,
    cnpj_filial TEXT,
    rateio TEXT,
    technology TEXT,
    load_time TEXT,
    weight_gross TEXT,
    weight_net TEXT
);

CREATE INDEX IF NOT EXISTS idx_staging_identifier ON staging_loads(load_identifier);
CREATE INDEX IF NOT EXISTS idx_staging_visit_code ON staging_loads(visit_code);
