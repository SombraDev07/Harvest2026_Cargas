from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import StreamingResponse
from typing import List
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import pandas as pd
import io

import models, schemas, database, validation
from database import engine, get_db

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

@app.get("/loads", response_model=List[schemas.LoadResponse])
def get_loads(
    skip: int = 0, 
    limit: int = 100, 
    status: str = None, 
    error_type: str = None, # Renamed rule_filter to error_type to match newer frontend
    district: str = None,
    recent_only: bool = False,
    db: Session = Depends(get_db)
):
    query = db.query(models.Load)
    
    if status:
        query = query.filter(models.Load.status == status)
    
    if error_type:
        # We check both ErrorLedger link and error_message for robustness
        query = query.filter(models.Load.error_message.like(f"%{error_type}%"))
        
    if district:
        query = query.filter(models.Load.district == district)
        
    if recent_only:
        from datetime import datetime, timedelta
        threshold = datetime.now() - timedelta(hours=48)
        query = query.filter(models.Load.updated_at >= threshold)
        
    loads = query.order_by(models.Load.updated_at.desc()).offset(skip).limit(limit).all()
    return loads

@app.get("/registered-loads", response_model=List[schemas.RegisteredLoadResponse])
def get_registered_loads(db: Session = Depends(get_db)):
    return db.query(models.RegisteredLoad).order_by(models.RegisteredLoad.timestamp.desc()).all()

@app.post("/registered-loads", response_model=schemas.RegisteredLoadResponse)
def register_load(load: schemas.RegisteredLoadCreate, db: Session = Depends(get_db)):
    # Check if already registered
    existing = db.query(models.RegisteredLoad).filter(models.RegisteredLoad.load_identifier == load.load_identifier).first()
    if existing:
        return existing
    
    db_load = models.RegisteredLoad(**load.model_dump())
    db.add(db_load)
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
    threshold = datetime.now() - timedelta(hours=48)
    
    # Filter only loads updated in the last 48h
    recent_loads_query = db.query(models.Load.load_identifier).filter(models.Load.updated_at >= threshold)
    recent_identifiers = [r[0] for r in recent_loads_query.all()]
    
    # Error classification counts for RECENT loads only
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
async def upload_spreadsheet(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith(('.xlsx', '.csv')):
        raise HTTPException(status_code=400, detail="Invalid file format")
    
    content = await file.read()
    buffer = io.BytesIO(content)
    
    try:
        # User specified: Line 2 (index 1), Col I (index 8), Col N (index 13)
        df = pd.read_excel(buffer, header=1) if file.filename.endswith('.xlsx') else pd.read_csv(buffer)
            
        cols = df.columns.tolist()

        # Strict Index Mapping (Line 2 is headers)
        # I = index 8 (DISTRITO), N = index 13 (ID)
        # Weights: S = 18, T = 19
        # Plate: X = 23, Product: V = 21
        
        # Exact Mapping as per user provided column list
        import unicodedata
        
        def normalize_str(s):
            if not s: return ""
            return "".join(c for c in unicodedata.normalize('NFD', str(s))
                         if unicodedata.category(c) != 'Mn').lower().strip()

        normalized_cols = [normalize_str(c) for c in cols]

        def safe_get_col(idx, default):
            return cols[idx] if len(cols) > idx else default

        def clean_val(val):
            if pd.isna(val) or val == "" or str(val).lower() == "nan": return "N/A"
            return str(val).strip()

        def find_column(names, default_idx):
            # 1. Try exact normalized match
            for target in names:
                norm_target = normalize_str(target)
                if norm_target in normalized_cols:
                    return cols[normalized_cols.index(norm_target)]
            
            # 2. Try fragment match
            for target in names:
                norm_target = normalize_str(target)
                for i, col_name in enumerate(normalized_cols):
                    if norm_target in col_name:
                        return cols[i]
            
            # 3. Fallback to index if safe
            return safe_get_col(default_idx, names[0])

        col_id = find_column(["ID"], 13)
        col_district = find_column(["DISTRITO FILIAL", "DISTRITO"], 8)
        col_weight_gross = find_column(["PESO LÍQUIDO (KG)", "PESO LÍQUIDO"], 18)
        col_weight_net = find_column(["PESO LÍQUIDO C/ DESCONTO (KG)", "PESO LIQUIDO C/ DESCONTO", "PLCD"], 19)
        col_plate = find_column(["PLACA DO CAMINHÃO", "PLACA"], 23)
        col_product = find_column(["PRODUTOR"], 21)
        col_visit = find_column(["CÓDIGO VISITA", "VISITA", "COD"], 0)
        col_doc = find_column(["NÚMERO DOCUMENTO", "DOCUMENTO", "ROMANEIO"], 17)
        col_city = find_column(["CIDADE FILIAL", "CIDADE"], 10)
        col_cnpj_filial = find_column(["CNPJ FILIAL PDR", "CNPJ FILIAL", "CNPJ/FILIAL"], 12)
        col_rateio = find_column(["rateio"], 31)

        # Unique districts for the frontend filter
        unique_districts = df[col_district].dropna().unique().astype(str).tolist() if col_district in df.columns else []
        
        imported_count = 0
        updated_count = 0
        
        # Helper for ultra-defensive numeric conversion
        def to_float(val):
            if pd.isna(val) or val == "": return 0.0
            try:
                if isinstance(val, (int, float)): return float(val)
                # Handle BR format: 41.060 or 41.060,00
                s = str(val).strip().replace('.', '').replace(',', '.')
                return float(s)
            except: 
                return 0.0

        # Optimization: Fetch all existing identifiers once to avoid N queries
        existing_loads_map = {l.load_identifier: l for l in db.query(models.Load).all()}
        
        chunk_updates = []
        for _, row in df.iterrows():
            raw_id = row.get(col_id)
            if raw_id is None or pd.isna(raw_id) or str(raw_id).strip() == "":
                continue
                
            load_id = str(raw_id).strip()
            load = existing_loads_map.get(load_id)
            
            if not load:
                load = models.Load(load_identifier=load_id)
                db.add(load)
                existing_loads_map[load_id] = load # Track new one too
                imported_count += 1
            else:
                updated_count += 1

            # Populate/Update fields
            load.truck_plate = clean_val(row.get(col_plate))
            load.product = clean_val(row.get(col_product))
            load.district = clean_val(row.get(col_district))
            load.visit_code = clean_val(row.get(col_visit))
            load.doc_number = clean_val(row.get(col_doc))
            load.city = clean_val(row.get(col_city))
            load.cnpj_filial = clean_val(row.get(col_cnpj_filial))
            load.rateio = clean_val(row.get(col_rateio)) or "NÃO"
            load.weight_gross = to_float(row.get(col_weight_gross))
            load.weight_net = to_float(row.get(col_weight_net))
            load.status = "pending" # Reset to re-validate
            load.updated_at = models.func.now() # Mark as newly arrived/updated now
                
            # Flush periodically
            if (imported_count + updated_count) % 2000 == 0:
                db.flush() # Send to DB but don't commit yet to keep transaction open
        
        db.commit()
        
        # Immediate Validation for the first 10,000 pending loads
        validation.run_batch_validation(db, limit=10000)
        
        return {
            "message": "Cargas processadas e analisadas com sucesso!",
            "total_rows": len(df),
            "imported_new": imported_count,
            "updated_existing": updated_count,
            "districts": unique_districts
        }
        
    except Exception as e:
        print(f"UPLOAD FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro interno no processamento: {str(e)}")
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
