from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import StreamingResponse
from typing import List
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import pandas as pd
import io

import models, schemas, database, validation
from database import engine, get_db
from rules.utils import normalize_str

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Harvest 2026 Cargas RPA")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Harvest 2026 API is running"}

@app.on_event("startup")
def run_migrations():
    """Self-healing migration to ensure DB schema is up to date on production."""
    from sqlalchemy import text
    with engine.connect() as conn:
        print("--- [MIGRATION] Checking for missing columns in 'loads' table ---")
        # List of columns to check and their types (PostgreSQL compatible)
        columns = [
            ("is_urgent", "BOOLEAN DEFAULT FALSE"),
            ("arrival_at", "TIMESTAMP WITHOUT TIME ZONE"),
            ("updated_at", "TIMESTAMP WITHOUT TIME ZONE")
        ]
        
        for col_name, col_type in columns:
            try:
                # Add column if it doesn't exist (Supported by Postgres 9.6+)
                conn.execute(text(f"ALTER TABLE loads ADD COLUMN IF NOT EXISTS {col_name} {col_type}"))
                conn.commit()
                print(f"--- [MIGRATION] Column {col_name} ensured ---")
            except Exception as e:
                print(f"--- [MIGRATION] Warning: Could not ensure column {col_name}: {e} ---")

@app.on_event("startup")
def seed_user():
    db = next(get_db())
    # Seed admin email as requested
    user = db.query(models.User).filter(models.User.username == "BrunoHarvest2026@BureauVeritas.com").first()
    if not user:
        new_user = models.User(
            username="BrunoHarvest2026@BureauVeritas.com", 
            password_hash="ChildrenOfLight123***", 
            role="admin"
        )
        db.add(new_user)
        db.commit()
        print("--- [SEED] User BrunoHarvest2026@BureauVeritas.com created ---")

@app.post("/login", response_model=schemas.LoginResponse)
def login(req: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == req.username).first()
    if not user or user.password_hash != req.password:
        raise HTTPException(status_code=401, detail="Usuário ou senha inválidos")
    
    return schemas.LoginResponse(
        id=user.id,
        username=user.username,
        role=user.role,
        token="SIMULATED-JWT-TOKEN"
    )

@app.get("/loads", response_model=List[schemas.LoadResponse])
def get_loads(
    skip: int = 0, 
    limit: int = 100, 
    status: str = None, 
    error_type: str = None, 
    district: str = None,
    queue: str = None, # urgent or normal
    db: Session = Depends(get_db)
):
    query = db.query(models.Load)
    
    # Queue Filtering (72h logic)
    from datetime import datetime, timedelta
    threshold_72h = datetime.now() - timedelta(hours=72)

    if queue == "urgent":
        # must be marked urgent AND arrived less than 72h ago
        query = query.filter(models.Load.is_urgent == True, models.Load.arrival_at >= threshold_72h)
    elif queue == "normal":
        # was NOT marked urgent OR was urgent but has expired (>72h)
        from sqlalchemy import or_
        query = query.filter(or_(
            models.Load.is_urgent == False,
            models.Load.arrival_at < threshold_72h
        ))

    if error_type:
        query = query.join(models.ErrorLedger, models.Load.load_identifier == models.ErrorLedger.load_identifier)\
                     .filter(models.ErrorLedger.error_type == error_type)
    elif status:
        query = query.filter(models.Load.status == status)
        
    if district:
        query = query.filter(models.Load.district == district)
        
    loads = query.order_by(models.Load.updated_at.desc()).offset(skip).limit(limit).all()
    return loads

@app.get("/registered-loads", response_model=List[schemas.RegisteredLoadResponse])
def get_registered_loads(db: Session = Depends(get_db)):
    return db.query(models.RegisteredLoad).order_by(models.RegisteredLoad.timestamp.desc()).all()

@app.post("/registered-loads", response_model=schemas.RegisteredLoadResponse)
def register_load(load: schemas.RegisteredLoadCreate, db: Session = Depends(get_db)):
    # Check if already registered for THIS specific error type
    existing = db.query(models.RegisteredLoad).filter(
        models.RegisteredLoad.load_identifier == load.load_identifier,
        models.RegisteredLoad.error_type == load.error_type
    ).first()
    
    if existing:
        return existing
    
    db_load = models.RegisteredLoad(**load.model_dump())
    db.add(db_load)
    
    # Granular cleanup: only remove THIS error type from the ledger
    db.query(models.ErrorLedger).filter(
        models.ErrorLedger.load_identifier == load.load_identifier,
        models.ErrorLedger.error_type == load.error_type
    ).delete()
    
    db.commit()
    db.refresh(db_load)
    return db_load

@app.delete("/registered-loads/{load_id}")
def delete_registered_load(load_id: int, db: Session = Depends(get_db)):
    db_load = db.query(models.RegisteredLoad).filter(models.RegisteredLoad.id == load_id).first()
    if not db_load:
        raise HTTPException(status_code=404, detail="Registered load not found")
    db.delete(db_load)
    db.commit()
    return {"message": "Success"}

@app.post("/loads/register-memory")
def register_historical_ids(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Registers all IDs from a spreadsheet as 'Known' (Memory). These will NOT be urgent on future uploads."""
    try:
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents), engine='openpyxl')
        
        # Look for ID column (Col N usually)
        id_col = None
        for col in df.columns:
            if 'ID' in str(col).upper() or 'IDENTIFICADOR' in str(col).upper():
                id_col = col
                break
        
        if id_col is None:
            # Fallback if header detection fails (Col 13 is N zero-indexed)
            if len(df.columns) > 13:
                id_col = df.columns[13]
            else:
                raise HTTPException(status_code=400, detail="Coluna ID não encontrada")

        ids = df[id_col].dropna().astype(str).unique().tolist()
        
        count = 0
        from datetime import datetime
        for lid in ids:
            existing = db.query(models.KnownID).filter(models.KnownID.load_identifier == lid).first()
            if not existing:
                db.add(models.KnownID(load_identifier=lid, registered_at=datetime.now()))
                count += 1
        
        db.commit()
        return {"message": f"Memória atualizada: {count} novos IDs registrados", "total_registered": count}
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/analysis/status", response_model=List[schemas.AnalysisStatus])
def get_analysis_status(db: Session = Depends(get_db)):
    # Return all active analysis
    return db.query(models.TableAnalysis).all()

@app.post("/analysis/start", response_model=schemas.AnalysisStatus)
def start_analysis(data: schemas.AnalysisCreate, db: Session = Depends(get_db)):
    # Simple logic: override active one for this rule
    db.query(models.TableAnalysis).filter(models.TableAnalysis.rule_filter == data.rule_filter).delete()
    
    db_analysis = models.TableAnalysis(
        rule_filter=data.rule_filter,
        user_name=data.user_name,
        started_at=models.func.now()
    )
    db.add(db_analysis)
    db.commit()
    db.refresh(db_analysis)
    return db_analysis

@app.post("/analysis/finish")
def finish_analysis(rule_filter: str, db: Session = Depends(get_db)):
    db.query(models.TableAnalysis).filter(models.TableAnalysis.rule_filter == rule_filter).delete()
    db.commit()
    return {"message": "Success"}

@app.delete("/system/reset")
def reset_system(db: Session = Depends(get_db)):
    """Deletes all loads and audit data, but preserves registered IDs (allowlist)."""
    db.query(models.ErrorLedger).delete()
    db.query(models.OperationLog).delete()
    db.query(models.TableAnalysis).delete()
    db.query(models.Load).delete()
    db.commit()
    return {"message": "Sistema reiniciado com sucesso!"}

@app.get("/analytics", response_model=schemas.AnalyticsSummary)
def get_analytics(db: Session = Depends(get_db)):
    total = db.query(models.Load).count()
    # Source of Truth for Status
    validated = db.query(models.Load).filter(models.Load.status == "validated").count()
    pending = db.query(models.Load).filter(models.Load.status == "pending").count()
    
    # Source of Truth for Errors (Distinct Loads that have at least one error in Ledger)
    error_loads_count = db.query(models.ErrorLedger.load_identifier).distinct().count()
    
    # Count visits sent to operation
    operation_count = db.query(models.OperationLog).count()
    
    # Rule based counts (FROM LEDGER - The absolute Source of Truth)
    # We query the ledger to see how many entries exist for each category
    from sqlalchemy import func
    rule_counts_raw = db.query(models.ErrorLedger.error_type, func.count(models.ErrorLedger.id)).group_by(models.ErrorLedger.error_type).all()
    
    # Initialize with 0s to ensure all keys exist for frontend
    rule_counts = {
        "duplicado": 0,
        "documento": 0,
        "campos": 0,
        "placa": 0,
        "peso_limite": 0,
        "peso_ficticio": 0,
        "desconto": 0,
        "rateio_peso": 0,
        "rateio_parceiro": 0,
        "rateio_tech": 0,
        "rateio_possivel": 0,
        "peso_duplicado": 0,
        "rateio_mesmo_pdr": 0
    }
    
    for etype, count in rule_counts_raw:
        if etype in rule_counts:
            rule_counts[etype] = count
    
    total_weight = db.query(models.Load).with_entities(models.func.sum(models.Load.weight_net)).scalar() or 0.0

    # District Performance Analysis
    from sqlalchemy import case
    district_performance_raw = db.query(
        models.Load.district,
        func.count(models.Load.id).label("total"),
        func.sum(case((models.Load.status == "error", 1), else_=0)).label("errors")
    ).group_by(models.Load.district).all()

    district_performance = []
    for row in district_performance_raw:
        total_loads = row.total or 0
        error_loads = int(row.errors or 0)
        error_rate = (error_loads / total_loads * 100) if total_loads > 0 else 0
        
        district_performance.append({
            "name": row.district or "Desconhecido",
            "total_loads": total_loads,
            "error_loads": error_loads,
            "error_rate": round(error_rate, 1)
        })
    
    district_performance.sort(key=lambda x: x["error_loads"], reverse=True)

    return {
        "total_loads": total,
        "validated_loads": validated,
        "pending_loads": pending,
        "error_loads": error_loads_count,
        "operation_loads": operation_count,
        "total_weight": total_weight,
        "rule_breakdown": rule_counts,
        "district_performance": district_performance
    }

@app.get("/analytics/fast-track")
def get_fast_track_analytics(db: Session = Depends(get_db)):
    from datetime import datetime, timedelta
    threshold = datetime.now() - timedelta(hours=72)
    
    # Filter only loads marked as URGENT and arrived in the last 72h
    recent_loads_query = db.query(models.Load.load_identifier).filter(
        models.Load.is_urgent == True,
        models.Load.arrival_at >= threshold
    )
    recent_identifiers = [r[0] for r in recent_loads_query.all()]
    
    # Error classification counts for URGENT loads only
    rule_counts = {k: 0 for k in [
        "duplicado", "documento", "campos", "placa", "peso_limite", 
        "peso_ficticio", "desconto", "rateio_peso", "rateio_parceiro", 
        "rateio_tech", "rateio_possivel", "peso_duplicado", "rateio_mesmo_pdr"
    ]}
    
    if recent_identifiers:
        rule_counts_raw = db.query(models.ErrorLedger.error_type, func.count(models.ErrorLedger.id))\
            .filter(models.ErrorLedger.load_identifier.in_(recent_identifiers))\
            .group_by(models.ErrorLedger.error_type).all()
            
        for etype, count in rule_counts_raw:
            if etype in rule_counts:
                rule_counts[etype] = count

    return {
        "total_recent": len(recent_identifiers),
        "rule_breakdown": rule_counts
    }

@app.get("/loads/export")
def export_rule_csv(rule_filter: str, db: Session = Depends(get_db)):
    def generate():
        # Header
        yield "ID,VISITA,DISTRITO,CNPJ_FILIAL,DOC/ROMANEIO,PLACA,PRODUTOR,PESO_LIQ,STATUS,ERRO\n"
        
        # Stream from DB
        query = db.query(models.Load).filter(models.Load.error_message.like(f"%{rule_filter}%"))
        
        for load in query.yield_per(100):
            row = [
                str(load.load_identifier),
                str(load.visit_code),
                str(load.district).replace(",", " "),
                str(load.cnpj_filial).replace(",", " "),
                str(load.doc_number),
                str(load.truck_plate),
                str(load.product).replace(",", " "),
                str(load.weight_net),
                str(load.status),
                str(load.error_message).replace(",", ";")
            ]
            yield ",".join(row) + "\n"

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=relatorio_{rule_filter}.csv"}
    )

@app.post("/validate")
def trigger_validation(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # 1. Reset everything to pending and CLEAR old error messages
    # This is vital so that 100% of the row count (80k+) is revisited
    db.query(models.Load).update({
        "status": "pending",
        "error_message": None
    })
    
    # 2. Clear tracking tables entirely
    db.query(models.ValidatedLoad).delete()
    db.query(models.ErrorLedger).delete()
    db.commit()
    
    # 3. Run validation in background to avoid browser timeout
    # We use a separate session for background work
    def run_full_audit():
        from database import SessionLocal
        inner_db = SessionLocal()
        try:
            validation.run_batch_validation(inner_db, limit=1000000)
        finally:
            inner_db.close()
            
    background_tasks.add_task(run_full_audit)
    
    return {"message": "Auditoria de 80.000+ linhas iniciada em segundo plano. Recarregue a página em alguns segundos para ver o resultado limpo."}

@app.get("/analytics/district/{district_name}")
def get_district_distribution(district_name: str, db: Session = Depends(get_db)):
    # Error classification patterns
    rules = [
        {"name": "Duplicidade", "pattern": "duplicado"},
        {"name": "Padrão Doc", "pattern": "padrão"},
        {"name": "Preenchimento", "pattern": "não preenchido"},
        {"name": "Placa", "pattern": "Placa inválida"},
        {"name": "Limite Peso", "pattern": "acima do limite"},
        {"name": "Peso Fictício", "pattern": "peso fictício"},
        {"name": "Desconto", "pattern": "Desconto excessivo"},
    ]
    
    distribution = []
    
    for idx, r in enumerate(rules):
        count = db.query(models.Load).filter(
            models.Load.district == district_name,
            models.Load.status == "error",
            models.Load.error_message.like(f"%{r['pattern']}%")
        ).count()
        
        if count > 0:
            distribution.append({
                "rule": r["name"],
                "count": count,
                "x": (idx * 15) + 20, # X position for chart
                "y": 50 + (idx % 2 * 10), # Slight Y stagger
                "z": count # Radius/Size
            })
            
    return distribution

@app.post("/validate-all")
def trigger_validation_old(district: str = None, db: Session = Depends(get_db)):
    results = validation.run_batch_validation(db, district=district)
    return {"message": f"Validation batch completed for {district or 'all districts'}", "results": results}

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), wipe: bool = False, db: Session = Depends(get_db)):
    if not file.filename.endswith(('.xlsx', '.csv')):
        raise HTTPException(status_code=400, detail="Invalid file format")
    
    if wipe:
        print("--- [WIPE] Clearing existing data before upload ---")
        db.query(models.ErrorLedger).delete()
        db.query(models.OperationLog).delete()
        db.query(models.TableAnalysis).delete()
        db.query(models.Load).delete()
        db.commit()

    content = await file.read()
    buffer = io.BytesIO(content)
    
    try:
        df = None
        # Load File - Attempt header=1 (Second Row) then header=0 (First Row)
        try:
            if file.filename.endswith('.xlsx'):
                df = pd.read_excel(buffer, header=1) 
            else:
                df = pd.read_csv(buffer, header=1)
        except:
            buffer.seek(0)
            if file.filename.endswith('.xlsx'):
                df = pd.read_excel(buffer, header=0)
            else:
                df = pd.read_csv(buffer, header=0)
            
        if df is None or df.empty:
            raise Exception("Planilha vazia ou não pôde ser lida.")

        # 1. MAKE HEADERS UNIQUE & ROBUST
        new_cols = []
        counts = {}
        for c in df.columns:
            c_str = str(c) if not pd.isna(c) else "COLUNA"
            base = normalize_str(c_str).upper().strip() or "VAZIA"
            if base in counts:
                counts[base] += 1
                new_cols.append(f"{base}_{counts[base]}")
            else:
                counts[base] = 0
                new_cols.append(base)
        df.columns = new_cols
        normalized_cols = list(df.columns)

        def find_column_robust(names, default_idx):
            # 1. Exact normalized match
            for target in names:
                norm_target = normalize_str(str(target)).upper().strip()
                if norm_target in normalized_cols: return norm_target
            # 2. Fragment match
            for target in names:
                norm_target = normalize_str(str(target)).upper().strip()
                for col in normalized_cols:
                    if norm_target in col: return col
            # 3. Index fallback
            if len(df.columns) > default_idx: return df.columns[default_idx]
            return normalized_cols[0] if normalized_cols else "MISSING"

        col_id = find_column_robust(["ID"], 13)
        col_district = find_column_robust(["DISTRITO FILIAL", "DISTRITO"], 8)
        col_weight_gross = find_column_robust(["PESO LÍQUIDO", "PESO LIQUIDO"], 18)
        col_weight_net = find_column_robust(["PESO LÍQUIDO C/ DESCONTO", "PESO LIQUIDO C/ DESCONTO", "PLCD"], 19)
        col_plate = find_column_robust(["PLACA DO CAMINHÃO", "PLACA"], 23)
        col_product = find_column_robust(["PRODUTOR"], 21)
        col_visit = find_column_robust(["CÓDIGO VISITA", "VISITA", "COD"], 0)
        col_doc = find_column_robust(["NÚMERO DOCUMENTO", "DOCUMENTO", "ROMANEIO"], 17)
        col_cnpj_filial = find_column_robust(["CNPJ FILIAL PDR", "CNPJ FILIAL", "CNPJ/FILIAL"], 12)
        col_rateio = find_column_robust(["RATEIO"], 31)
        col_technology = find_column_robust(["RESULTADO DO TESTE ACOMPANHADO", "TECNOLOGIA", "TECH", "SISTEMA"], 20)
        col_city = find_column_robust(["CIDADE FILIAL", "CIDADE"], 10)
        col_load_time = find_column_robust(["HORÁRIO", "HORA", "HORA DA CARGA"], 15)

        # Helper for ultra-defensive converters
        def to_float(val):
            if isinstance(val, pd.Series): val = val.iloc[0] if not val.empty else 0.0
            if pd.isna(val) or val == "" or str(val).lower() == "nan": return 0.0
            try:
                if isinstance(val, (int, float)): return float(val)
                s = str(val).strip().replace('.', '').replace(',', '.')
                return float(s)
            except: return 0.0

        def clean_val(val):
            if isinstance(val, pd.Series): val = val.iloc[0] if not val.empty else "N/A"
            if pd.isna(val) or val == "" or str(val).lower() == "nan": return "N/A"
            return str(val).strip()

        # Pre-fetch for UPSERT and Delta logic
        existing_loads_map = {l.load_identifier: l for l in db.query(models.Load).all()}
        known_ids_set = {ki.load_identifier for ki in db.query(models.KnownID).all()}
        
        imported_count = 0
        updated_count = 0
        from datetime import datetime
        now = datetime.now()
        
        unique_districts = []
        if col_district in df.columns:
            unique_districts = df[col_district].dropna().unique().astype(str).tolist()

        for row_idx, row in df.iterrows():
            raw_id = row.get(col_id)
            if raw_id is None or pd.isna(raw_id) or str(raw_id).strip() == "":
                continue
                
            load_id = str(raw_id).strip()
            load = existing_loads_map.get(load_id)
            is_new_id = load_id not in known_ids_set
            
            if not load:
                load = models.Load(load_identifier=load_id)
                db.add(load)
                existing_loads_map[load_id] = load
                imported_count += 1
            else:
                updated_count += 1

            # Delta Logic: Mark as urgent if ID is previously unknown
            if is_new_id:
                load.is_urgent = True
                load.arrival_at = now
            else:
                load.is_urgent = False
                # arrival_at stays as is or can be cleared

            # Populate Fields
            load.truck_plate = clean_val(row.get(col_plate))
            load.product = clean_val(row.get(col_product))
            load.district = clean_val(row.get(col_district))
            load.visit_code = clean_val(row.get(col_visit))
            load.doc_number = clean_val(row.get(col_doc))
            load.city = clean_val(row.get(col_city))
            load.cnpj_filial = clean_val(row.get(col_cnpj_filial))
            load.rateio = clean_val(row.get(col_rateio))
            load.technology = clean_val(row.get(col_technology))
            load.load_time = clean_val(row.get(col_load_time))
            load.weight_gross = to_float(row.get(col_weight_gross))
            load.weight_net = to_float(row.get(col_weight_net))
            load.status = "pending" 
            load.updated_at = models.func.now()
            
            if (row_idx + 1) % 2000 == 0:
                db.flush()
        
        db.commit()
        
        # Immediate Validation (Non-blocking)
        try:
            validation.run_batch_validation(db, limit=100000)
        except Exception as audit_err:
            print(f"AUTO-AUDIT WARNING: {audit_err}")
            
        return {
            "message": "Cargas processadas com sucesso!",
            "total_rows": len(df),
            "imported_new": imported_count,
            "updated_existing": updated_count,
            "districts": unique_districts
        }
        
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"UPLOAD FATAL ERROR:\n{tb}")
        # Return full traceback in detail for surgical debugging
        raise HTTPException(status_code=500, detail=f"ERRO TÉCNICO: {str(e)}\n\n{tb[:500]}...")
@app.post("/loads/register/import")
async def import_registered_loads(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith(('.xlsx', '.csv')):
        raise HTTPException(status_code=400, detail="Invalid file format")
    
    content = await file.read()
    buffer = io.BytesIO(content)
    
    try:
        df = pd.read_excel(buffer) if file.filename.endswith('.xlsx') else pd.read_csv(buffer)
        
        # Clean column names to be flexible
        df.columns = [str(c).upper().strip() for c in df.columns]
        
        # Mapping: COD -> visit_code, ID -> load_identifier, MOTIVO -> reason
        col_map = {
            'COD': next((c for c in df.columns if 'COD' in c), None),
            'ID': next((c for c in df.columns if 'ID' in c), None),
            'MOTIVO': next((c for c in df.columns if 'MOTIV' in c), None),
        }

        if not col_map['ID']:
            raise HTTPException(status_code=400, detail="Coluna 'ID' não encontrada na planilha.")

        # Batch check for existing
        existing_ids = {r[0] for r in db.query(models.RegisteredLoad.load_identifier).all()}
        
        new_records = []
        for _, row in df.iterrows():
            l_id = str(row.get(col_map['ID'])).strip()
            if not l_id or l_id == 'nan' or l_id in existing_ids:
                continue
            
            new_records.append(models.RegisteredLoad(
                visit_code=str(row.get(col_map['COD'] or 'N/A')).strip() if col_map['COD'] else 'N/A',
                load_identifier=l_id,
                error_type=None, # Bulk import usually marks ID as generically solved
                column_name="IMPORTAÇÃO", 
                user_name="IMPORTAÇÃO",
                reason=str(row.get(col_map['MOTIVO'] or 'Importação em massa')).strip() if col_map['MOTIVO'] else 'Importação em massa'
            ))
            existing_ids.add(l_id) # Avoid duplicates in same file

        if new_records:
            db.bulk_save_objects(new_records)
            db.commit()
            
        return {"message": f"{len(new_records)} IDs registrados com sucesso!"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro no import: {str(e)}")
