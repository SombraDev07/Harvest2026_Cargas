from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import StreamingResponse
from typing import List, Any
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from typing import Optional, List

def br_now():
    """Returns the current time in BRT (UTC-3)."""
    return datetime.utcnow() - timedelta(hours=3)

# Add Base User Model for Supabase linking if needed
import pandas as pd
import io
import os
import uuid
import requests

import models, schemas, database, validation
from database import engine, get_db, SessionLocal
from rules.utils import normalize_str

# Create tables
models.Base.metadata.create_all(bind=engine)

def set_cfg(db: Session, key: str, val: Any):
    """Auxiliar para salvar configurações de sistema de forma persistente no DB."""
    try:
        cfg = db.query(models.SystemConfig).filter(models.SystemConfig.key == key).first()
        if cfg:
            cfg.value = str(val)
        else:
            db.add(models.SystemConfig(key=key, value=str(val)))
        db.commit()
    except Exception as e:
        print(f"Erro ao salvar config {key}: {e}")
        db.rollback()

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    print("--- [MIGRATION] Checking for missing columns in 'loads' table ---")
    with engine.connect() as conn:
        try:
            # Ensure critical columns and tables
            conn.execute(text("ALTER TABLE loads ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT FALSE"))
            print("--- [MIGRATION] Column is_urgent ensured ---")
            conn.execute(text("ALTER TABLE loads ADD COLUMN IF NOT EXISTS arrival_at TIMESTAMP"))
            print("--- [MIGRATION] Column arrival_at ensured ---")
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR"))
            print("--- [MIGRATION] Column name in users ensured ---")
            conn.execute(text("ALTER TABLE loads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"))
            print("--- [MIGRATION] Column updated_at ensured ---")
            
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS system_config (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            """))
            print("--- [MIGRATION] Table system_config ensured ---")
            
            # Reset processing status on startup
            conn.execute(text("UPDATE system_config SET value = 'false' WHERE key = 'is_processing'"))
            conn.execute(text("UPDATE system_config SET value = '0' WHERE key = 'processing_progress'"))
            conn.execute(text("UPDATE system_config SET value = 'Nenhum' WHERE key = 'active_filename'"))
            conn.commit()
            print("--- [SYSTEM] Resetting processing status on startup ---")
            
            # --- AUTH-APPLY SQL PROCEDURE ---
            # Path relative to backend/main.py is ../validation_procedure.sql
            proc_path = os.path.join(os.path.dirname(__file__), "..", "validation_procedure.sql")
            if os.path.exists(proc_path):
                 print(f"--- [MIGRATION] Applying {proc_path} ---")
                 with open(proc_path, "r") as f:
                     sql_proc = f.read()
                 conn.execute(text(sql_proc))
                 conn.commit()
                 print("--- [MIGRATION] Validation procedure updated! ---")
            
        except Exception as e:
            print(f"Migration/Startup error: {e}")
            
    # Seed data
    db = SessionLocal()
    try:
        # Check for admin
        admin = db.query(models.User).filter(models.User.username == "BrunoHarvest2026@BureauVeritas.com").first()
        if admin:
             admin.full_name = "Bruno Harvest 2026"
             db.commit()
             print("--- [SEED] Admin BrunoHarvest2026@BureauVeritas.com updated ---")
    finally:
        db.close()
        
    yield

app = FastAPI(title="Harvest 2026 Cargas RPA", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Harvest 2026 API is running"}

@app.post("/system/reset")
def reset_system_status(db: Session = Depends(get_db)):
    """Reseta o status de processamento preso no banco de dados."""
    set_cfg(db, "is_processing", "false")
    set_cfg(db, "processing_progress", "0")
    set_cfg(db, "active_filename", "Nenhum")
    return {"message": "Sistema resetado com sucesso. Pode tentar o upload novamente."}

@app.post("/login", response_model=schemas.LoginResponse)
def login(req: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == req.username).first()
    if not user or user.password_hash != req.password:
        raise HTTPException(status_code=401, detail="Usuário ou senha inválidos")
    
    return schemas.LoginResponse(
        id=user.id,
        username=user.username,
        name=user.name or user.username,
        role=user.role,
        token="SIMULATED-JWT-TOKEN"
    )

@app.get("/loads/export-all")
def export_all_xlsx(district: str = None, db: Session = Depends(get_db)):
    from sqlalchemy import exists, and_
    
    # Define all 14 official rules with their internal types and display names
    RULES_FOR_EXPORT = [
        {"name": "Romaneios Duplicados", "type": "duplicado"},
        {"name": "Fora de Padrão", "type": "padrao"},
        {"name": "Campo Inválido", "type": "campos"},
        {"name": "Placa Inválida", "type": "placa"},
        {"name": "Excesso de Peso", "type": "excesso_peso"},
        {"name": "Peso Fictício", "type": "peso_ficticio"},
        {"name": "Desconto Excessivo", "type": "desconto"},
        {"name": "Rateio Peso Inválido", "type": "rateio_peso"},
        {"name": "Rateio Sem Parceiro", "type": "rateio_parceiro"},
        {"name": "Rateio Tech Diferente", "type": "rateio_tech"},
        {"name": "Possível Rateio", "type": "rateio_possivel"},
        {"name": "Pesos Duplicados", "type": "peso_duplicado"},
        {"name": "Rateio Mesmo Produtor", "type": "rateio_mesmo_pdr"},
        {"name": "Duplicidade COD/COD", "type": "duplicidade_cod"}
    ]
    
    output = io.BytesIO()
    cols = ["COD", "DISTRITO", "ID", "PLACA", "TECNOLOGIA", "PRODUTOR", "DOC", "PL (KG)", "PLCD (KG)", "OBS / INCONSISTÊNCIA"]
    
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        for rule in RULES_FOR_EXPORT:
            # Consistent Query Logic with /loads and /loads/export
            query = db.query(models.Load)\
                      .join(models.ErrorLedger, models.Load.load_identifier == models.ErrorLedger.load_identifier)\
                      .filter(models.ErrorLedger.error_type == rule["type"])\
                      .add_columns(models.ErrorLedger.error_message.label("ledger_message"))
            
            if district and district != 'GERAL':
                query = query.filter(models.Load.district == district)
                
            # Exclude resolved
            resolved_stmt = exists().where(
                and_(
                    models.RegisteredLoad.load_identifier == models.Load.load_identifier,
                    models.RegisteredLoad.error_type == rule["type"]
                )
            )
            query = query.filter(~resolved_stmt)
            
            results = query.all()
            
            data = []
            if rule["type"] == "rateio_peso":
                # Special handling for Rateio grouping
                from collections import defaultdict
                groups = defaultdict(list)
                for item in results:
                    l = item[0]
                    msg = item[1] if (isinstance(item, tuple) or type(item).__name__ == 'Row') and len(item) > 1 else None
                    # Group by Visit Code + Plate + Time Window (50 min as in SQL)
                    # We'll use the visit_code and truck_plate as primary keys
                    # Since we don't have arrival_at here, we rely on visit_code which is unique per visit
                    group_key = (l.visit_code, l.truck_plate)
                    groups[group_key].append((l, msg))
                
                for (vcode, plate), items in groups.items():
                    group_pl = 0
                    group_plcd = 0
                    for l, msg in items:
                        group_pl += (l.weight_gross or 0)
                        group_plcd += (l.weight_net or 0)
                        data.append({
                            "COD": l.visit_code,
                            "DISTRITO": l.district,
                            "ID": l.load_identifier,
                            "PLACA": l.truck_plate,
                            "TECNOLOGIA": l.technology,
                            "PRODUTOR": l.product,
                            "DOC": l.doc_number,
                            "PL (KG)": l.weight_gross,
                            "PLCD (KG)": l.weight_net,
                            "OBS / INCONSISTÊNCIA": msg
                        })
                    # Add Summary Line for Group
                    data.append({
                        "COD": "", "DISTRITO": "", "ID": "", "PLACA": "", "TECNOLOGIA": "", 
                        "PRODUTOR": "TOTAL DO GRUPO:", "DOC": "", 
                        "PL (KG)": group_pl, "PLCD (KG)": group_plcd, 
                        "OBS / INCONSISTÊNCIA": "Inconsistência de Grupo Detectada"
                    })
                    # Add Spacing Line
                    data.append({k: "" for k in cols})
            else:
                # Standard linear export
                for item in results:
                    l = item[0]
                    msg = item[1] if (isinstance(item, tuple) or type(item).__name__ == 'Row') and len(item) > 1 else None
                    data.append({
                        "COD": l.visit_code,
                        "DISTRITO": l.district,
                        "ID": l.load_identifier,
                        "PLACA": l.truck_plate,
                        "TECNOLOGIA": l.technology,
                        "PRODUTOR": l.product,
                        "DOC": l.doc_number,
                        "PL (KG)": l.weight_gross,
                        "PLCD (KG)": l.weight_net,
                        "OBS / INCONSISTÊNCIA": msg
                    })
            
            df = pd.DataFrame(data, columns=cols)
            # Excel sheet name limit (31 chars) and invalid chars cleaning
            sheet_name = rule["name"][:31].replace(":", "").replace("/", "").replace("\\", "").replace("?", "").replace("*", "").replace("[", "").replace("]", "")
            df.to_excel(writer, index=False, sheet_name=sheet_name)
            
            # Apply formatting and AutoFilter
            worksheet = writer.sheets[sheet_name]
            if not df.empty:
                # Summary line formatting (bold)
                bold_fmt = writer.book.add_format({'bold': True, 'bg_color': '#F2F2F2'})
                for row_idx, row_data in enumerate(data):
                    if row_data.get("PRODUTOR") == "TOTAL DO GRUPO:":
                        worksheet.set_row(row_idx + 1, None, bold_fmt)
                
                # Add autofilter to all columns based on header
                worksheet.autofilter(0, 0, len(df), len(cols) - 1)
            
            # Simple column width adjustment
            for i, col in enumerate(df.columns):
                max_val = df[col].astype(str).map(len).max() if not df.empty else 0
                column_len = max(max_val, len(col)) + 2
                worksheet.set_column(i, i, min(column_len, 50))
    
    output.seek(0)
    filename = "Auditoria_Consolidada_Safra_2026.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
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
    
    # NEW FILTER: Exclude IDs that are already "Resolved" (in registered_loads)
    # We use a subquery to find these IDs
    resolved_ids_subquery = db.query(models.RegisteredLoad.load_identifier)
    if error_type:
        # If we have a specific error_type context, we only exclude if THAT error was resolved
        resolved_ids_subquery = resolved_ids_subquery.filter(models.RegisteredLoad.error_type == error_type)
    
    query = query.filter(~models.Load.load_identifier.in_(resolved_ids_subquery))

    # Queue Filtering (72h logic)
    threshold_72h = br_now() - timedelta(hours=72)

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
        # Optimization: Use a join instead of IN clause with thousands of IDs
        query = query.join(models.ErrorLedger, models.Load.load_identifier == models.ErrorLedger.load_identifier)\
                     .filter(models.ErrorLedger.error_type == error_type)\
                     .add_columns(models.ErrorLedger.error_message.label("ledger_message"))
        
    if district:
        query = query.filter(models.Load.district == district)
        
    results = query.order_by(models.Load.updated_at.desc()).offset(skip).limit(limit).all()
    
    final_loads = []
    for item in results:
        # SQLAlchemy 2.0 can return Row objects that act like tuples
        if isinstance(item, tuple) or type(item).__name__ == 'Row':
            load_obj = item[0]
            load_obj.error_message = item[1] if len(item) > 1 else None
            final_loads.append(load_obj)
        else:
            final_loads.append(item)

    return final_loads

@app.get("/config")
def get_config(db: Session = Depends(get_db)):
    """Returns current system configuration."""
    configs = db.query(models.SystemConfig).all()
    result = {c.key: c.value for c in configs}
    # Defaults
    if "corporate_email" not in result: result["corporate_email"] = "suporte@harvest2026.com.br"
    if "user_display_name" not in result: result["user_display_name"] = "Bruno S."
    if "rateio_delta_minutes" not in result: result["rateio_delta_minutes"] = "20"
    if "last_upload_at" not in result: result["last_upload_at"] = "Nenhuma planilha processada"
    
    return result

@app.patch("/config")
def update_config(data: dict, db: Session = Depends(get_db)):
    """Updates system configuration keys."""
    for key, value in data.items():
        config = db.query(models.SystemConfig).filter(models.SystemConfig.key == key).first()
        if config:
            config.value = str(value)
        else:
            db.add(models.SystemConfig(key=key, value=str(value)))
    db.commit()
    return {"message": "Configurações atualizadas com sucesso"}

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

@app.get("/system/status")
def get_system_status(db: Session = Depends(get_db)):
    """Returns general system status including active spreadsheet."""
    active_file = db.query(models.SystemConfig).filter(models.SystemConfig.key == "active_filename").first()
    last_upload = db.query(models.SystemConfig).filter(models.SystemConfig.key == "last_upload_at").first()
    is_processing = db.query(models.SystemConfig).filter(models.SystemConfig.key == "is_processing").first()
    progress = db.query(models.SystemConfig).filter(models.SystemConfig.key == "processing_progress").first()
    
    total_loads = db.query(models.Load).count()
    memory_count = db.query(models.KnownID).count()
    
    return {
        "active_filename": active_file.value if active_file else "Nenhuma planilha ativa",
        "last_upload_at": last_upload.value if last_upload else "N/A",
        "is_processing": True if is_processing and is_processing.value == "true" else False,
        "processing_progress": int(progress.value) if progress and progress.value.isdigit() else 0,
        "total_loads": total_loads,
        "memory_count": memory_count
    }

@app.get("/system/memory")
def get_system_memory(db: Session = Depends(get_db), limit: int = 200):
    """Returns the list of IDs registered in the RPA Memory."""
    return db.query(models.KnownID).order_by(models.KnownID.registered_at.desc()).limit(limit).all()

@app.delete("/system/memory/{load_identifier}")
def delete_memory_id(load_identifier: str, db: Session = Depends(get_db)):
    """Allows manual removal of an ID from memory."""
    item = db.query(models.KnownID).filter(models.KnownID.load_identifier == load_identifier).first()
    if not item: raise HTTPException(404, "ID not found in memory")
    db.delete(item)
    db.commit()
    return {"message": "ID removido da memória RPA"}

@app.delete("/registered-loads/{load_id}")
def delete_registered_load(load_id: int, db: Session = Depends(get_db)):
    db_load = db.query(models.RegisteredLoad).filter(models.RegisteredLoad.id == load_id).first()
    if not db_load:
        raise HTTPException(status_code=404, detail="Registered load not found")
    db.delete(db_load)
    db.commit()
    return {"message": "Success"}

@app.get("/districts")
def get_all_districts(db: Session = Depends(get_db)):
    """Returns a list of all distinct districts in the database."""
    d_list = [r[0] for r in db.query(models.Load.district).distinct().filter(models.Load.district.isnot(None), models.Load.district != "").all()]
    return {"districts": sorted(d_list)}

@app.post("/loads/register-memory")
def register_historical_ids(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Registers all IDs from a spreadsheet as 'Known' (Memory). These will NOT be urgent on future uploads."""
    try:
        contents = file.file.read()
        import io
        import pandas as pd
        
        file_ext = file.filename.split('.')[-1].lower() if file.filename else ''
        if file_ext == 'csv':
            df = pd.read_csv(io.BytesIO(contents), low_memory=False)
        else:
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

        ids = df[id_col].dropna().astype(str).str.strip().unique().tolist()
        
        count = 0
        from datetime import datetime
        now = br_now()
        
        chunk_size = 5000
        for i in range(0, len(ids), chunk_size):
            chunk = ids[i:i+chunk_size]
            existing = {k[0] for k in db.query(models.KnownID.load_identifier).filter(models.KnownID.load_identifier.in_(chunk)).all()}
            
            new_objs = []
            for lid in chunk:
                if lid not in existing:
                    new_objs.append(models.KnownID(load_identifier=lid, registered_at=now))
            
            if new_objs:
                db.bulk_save_objects(new_objs)
                db.commit()
                count += len(new_objs)
        
        # Track last upload time
        now_str = now.strftime("%d/%m/%Y %H:%M:%S")
        config_last = db.query(models.SystemConfig).filter(models.SystemConfig.key == "last_upload_at").first()
        if config_last:
            config_last.value = now_str
        else:
            db.add(models.SystemConfig(key="last_upload_at", value=now_str))
        db.commit()

        return {"message": f"Memória RPA atualizada! {count} novos IDs registrados.", "total_registered": count}
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
def get_analytics(db: Session = Depends(get_db), status: Optional[str] = None):
    total = db.query(models.Load).count()
    # Source of Truth for Status
    # Base Query
    filtered_query = db.query(models.Load)
    
    if status:
        filtered_query = filtered_query.filter(models.Load.status == status)
    else:
        # Default behavior for main analysis: show only pending/error
        filtered_query = filtered_query.filter(models.Load.status.in_(["pending", "error"]))
    
    validated = filtered_query.filter(models.Load.status == "validated").count()
    pending = filtered_query.filter(models.Load.status == "pending").count()
    operation_count = db.query(models.OperationLog.load_identifier).distinct().count()
    
    # Source of Truth for Errors (Distinct Loads that have at least one error in Ledger)
    # This count should reflect errors within the filtered set of loads
    error_loads_count = db.query(models.ErrorLedger.load_identifier)\
        .join(filtered_query.subquery(), models.ErrorLedger.load_identifier == models.Load.load_identifier)\
        .distinct().count()
    
    # Pending in last 72h count
    threshold_72h = br_now() - timedelta(hours=72)
    pending_72h = db.query(models.Load).filter(
        models.Load.status == "pending",
        models.Load.arrival_at < threshold_72h
    ).count()

    # Rule based counts (FROM LEDGER - The absolute Source of Truth)
    # We query the ledger to see how many entries exist for each category
    from sqlalchemy import func
    rule_counts_raw = db.query(models.ErrorLedger.error_type, func.count(models.ErrorLedger.id)).group_by(models.ErrorLedger.error_type).all()
    
    # Initialize with 0s to ensure all keys exist for frontend
    rule_counts = {
        "duplicado": 0,
        "campos": 0,
        "placa": 0,
        "excesso_peso": 0,
        "peso_ficticio": 0,
        "desconto": 0,
        "rateio_peso": 0,
        "rateio_parceiro": 0,
        "rateio_tech": 0,
        "rateio_possivel": 0,
        "peso_duplicado": 0,
        "rateio_mesmo_pdr": 0,
        "padrao": 0,
        "duplicidade_cod": 0
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
        dist_name = row.district or "Desconhecido"
        total_loads = row.total or 0
        error_loads = int(row.errors or 0)
        error_rate = (error_loads / total_loads * 100) if total_loads > 0 else 0
        
        # New: find top error for THIS district
        top_err_row = db.query(models.ErrorLedger.error_type, func.count(models.ErrorLedger.id).label("cnt"))\
            .filter(models.ErrorLedger.district == dist_name)\
            .group_by(models.ErrorLedger.error_type)\
            .order_by(text("cnt DESC"))\
            .first()
        
        district_performance.append({
            "name": dist_name,
            "total_loads": total_loads,
            "error_loads": error_loads,
            "error_rate": round(error_rate, 1),
            "top_error": top_err_row[0] if top_err_row else "Nenhum",
            "top_error_count": int(top_err_row[1]) if top_err_row else 0
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
        "district_performance": district_performance,
        "pending_72h_count": pending_72h
    }

@app.get("/analytics/fast-track")
def get_fast_track_analytics(db: Session = Depends(get_db)):
    from datetime import datetime, timedelta
    threshold = br_now() - timedelta(hours=72)
    
    # Filter only loads marked as URGENT and arrived in the last 72h
    recent_loads_query = db.query(models.Load.load_identifier).filter(
        models.Load.is_urgent == True,
        models.Load.arrival_at >= threshold
    )
    recent_identifiers = [r[0] for r in recent_loads_query.all()]
    
    # Error classification counts for URGENT loads only
    rule_counts = {k: 0 for k in [
        "duplicado", "campos", "placa", "excesso_peso", 
        "peso_ficticio", "desconto", "rateio_peso", "rateio_parceiro", 
        "rateio_tech", "rateio_possivel", "peso_duplicado", "rateio_mesmo_pdr",
        "padrao", "rateio_produtor", "duplicidade_cod"
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
        "rule_breakdown": rule_counts,
        "pending_72h_count": db.query(models.Load).filter(
            models.Load.status == "pending",
            models.Load.arrival_at < threshold
        ).count()
    }

@app.get("/loads/export")
def export_rule_xlsx(rule_filter: str, error_type: str = None, district: str = None, db: Session = Depends(get_db)):
    # 1. Start Query
    query = db.query(models.Load)
    
    # 2. Unify logic with /loads endpoint: Use join with ErrorLedger if error_type is provided
    if error_type:
        query = query.join(models.ErrorLedger, models.Load.load_identifier == models.ErrorLedger.load_identifier)\
                     .filter(models.ErrorLedger.error_type == error_type)\
                     .add_columns(models.ErrorLedger.error_message.label("ledger_message"))
    else:
        # Fallback to text search if no type provided (legacy support)
        query = query.filter(models.Load.error_message.ilike(f"%{rule_filter}%"))
        query = query.add_columns(models.Load.error_message.label("ledger_message"))

    # 3. Exclude IDs that are already "Resolved" using EXISTS (safer than NOT IN with nulls)
    from sqlalchemy import exists, and_
    resolved_stmt = exists().where(
        and_(
            models.RegisteredLoad.load_identifier == models.Load.load_identifier,
            models.RegisteredLoad.error_type == error_type if error_type else True
        )
    )
    query = query.filter(~resolved_stmt)
    
    if district and district != 'GERAL':
        query = query.filter(models.Load.district == district)
    
    results = query.all()
    
    # 4. Map to DataFrame with specific column names/order
    data = []
    for item in results:
        # Handle both Row objects (from join) and direct Model objects
        if isinstance(item, tuple) or type(item).__name__ == 'Row':
            l = item[0]
            msg = item[1] if len(item) > 1 else None
        else:
            l = item
            msg = l.error_message

        data.append({
            "COD": l.visit_code,
            "DISTRITO": l.district,
            "ID": l.load_identifier,
            "PLACA": l.truck_plate,
            "TECNOLOGIA": l.technology,
            "PRODUTOR": l.product,
            "DOC": l.doc_number,
            "PL (KG)": l.weight_gross,
            "PLCD (KG)": l.weight_net,
            "OBS / INCONSISTÊNCIA": msg
        })
    
    # Ensure columns exist even if data is empty
    cols = ["COD", "DISTRITO", "ID", "PLACA", "TECNOLOGIA", "PRODUTOR", "DOC", "PL (KG)", "PLCD (KG)", "OBS / INCONSISTÊNCIA"]
    df = pd.DataFrame(data, columns=cols)
    
    # 5. Create Excel buffer
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        df.to_excel(writer, index=False, sheet_name='Audit_Report')
        worksheet = writer.sheets['Audit_Report']
        # Simple auto-adjust column width
        for i, col in enumerate(df.columns):
            max_val = df[col].astype(str).map(len).max() if not df.empty else 0
            column_len = max(max_val, len(col)) + 2
            worksheet.set_column(i, i, min(column_len, 50)) # Cap width
            
    output.seek(0)
    
    filename = f"Relatorio_{rule_filter.replace(' ', '_')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
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
    
    # Set is_processing to true for the UI to show loading overlay
    c = db.query(models.SystemConfig).filter(models.SystemConfig.key == "is_processing").first()
    if c: c.value = "true"
    else: db.add(models.SystemConfig(key="is_processing", value="true"))
    
    db.commit()
    
    # 3. Run validation in background to avoid browser timeout
    # We use a separate session for background work
    def run_full_audit():
        from database import SessionLocal
        inner_db = SessionLocal()
        try:
            print("--- [BACKGROUND] Starting automation audit (Full) ---")
            validation.run_batch_validation(inner_db, limit=1000000)
        except Exception as e:
            print(f"--- [BACKGROUND ERROR] Validation crashed: {e} ---")
        finally:
            c = inner_db.query(models.SystemConfig).filter(models.SystemConfig.key == "is_processing").first()
            if c: c.value = "false"
            else: inner_db.add(models.SystemConfig(key="is_processing", value="false"))
            inner_db.commit()
            inner_db.close()
            
    background_tasks.add_task(run_full_audit)
    
    return {"message": "Auditoria de 80.000+ linhas iniciada em segundo plano. O painel mostrará a tela de carregamento."}

@app.get("/analytics/district/{district_name}")
def get_district_distribution(district_name: str, db: Session = Depends(get_db)):
    # Error classification patterns
    rules = [
        {"name": "Duplicidade", "pattern": "duplicado"},
        {"name": "Padrão Doc", "pattern": "padrao"},
        {"name": "Campo Inválido", "pattern": "campos"},
        {"name": "Placa", "pattern": "placa"},
        {"name": "Limite Peso", "pattern": "excesso_peso"},
        {"name": "Peso Fictício", "pattern": "peso_ficticio"},
        {"name": "Desconto", "pattern": "desconto"},
        {"name": "Rateio Produtor", "pattern": "rateio_produtor"},
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
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...), 
    wipe: bool = False, 
    db: Session = Depends(get_db)
):
    print(f"--- [UPLOAD] Request received: {file.filename} (wipe={wipe}) ---")
    if not file.filename.endswith(('.xlsx', '.csv')):
        print(f"--- [UPLOAD] Error: Invalid file format {file.filename} ---")
        raise HTTPException(status_code=400, detail="Invalid file format")
    
    # Set processing status
    set_cfg(db, "is_processing", "true")
    set_cfg(db, "active_filename", file.filename)
    set_cfg(db, "last_upload_at", br_now().strftime("%d/%m/%Y %H:%M:%S"))
    set_cfg(db, "processing_progress", "0")
    db.commit() # Commit these changes immediately so UI can reflect them
    
    # Helpers for data conversion
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
        # Remove quebras de linha e tabs que quebram agrupamentos no DB
        return str(val).replace('\n', ' ').replace('\r', ' ').replace('\t', ' ').strip()

    # We define the background function here
    def process_upload_in_background(content: bytes, filename: str):
        bg_db = database.SessionLocal()
        try:
            set_cfg(bg_db, "is_processing", "true")
            set_cfg(bg_db, "processing_progress", "5")
            set_cfg(bg_db, "active_filename", filename)

            # 1. READ FILE
            df = pd.read_excel(io.BytesIO(content), engine='openpyxl')
            
            if df is None or df.empty:
                set_cfg(bg_db, "is_processing", "false")
                set_cfg(bg_db, "last_validation_error", "Planilha vazia")
                return

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
            def find_robust(names, default):
                for target in names:
                    norm = normalize_str(str(target)).upper().strip()
                    if norm in normalized_cols: return norm
                for target in names:
                    norm = normalize_str(str(target)).upper().strip()
                    for col in normalized_cols:
                        if norm in col: return col
                return normalized_cols[default] if len(normalized_cols) > default else "MISSING"

            col_id = find_robust(["ID", "CHAVE", "IDENTIFICADOR", "TICKET"], 13)
            col_district = find_robust(["DISTRITO FILIAL", "DISTRITO"], 8)
            col_weight_gross = find_robust(["PESO LÍQUIDO", "PESO LIQUIDO", "PESO", "BRUTO"], 18)
            col_weight_net = find_robust(["PESO LÍQUIDO C/ DESCONTO", "PLCD"], 19)
            col_plate = find_robust(["PLACA DO CAMINHÃO", "PLACA", "VEICULO"], 23)
            col_product = find_robust(["PRODUTOR", "CLIENTE"], 21)
            col_visit = find_robust(["CÓDIGO VISITA", "VISITA"], 0)
            col_doc = find_robust(["NÚMERO DOCUMENTO", "DOCUMENTO"], 17)
            col_cnpj_filial = find_robust(["CNPJ FILIAL PDR", "CNPJ FILIAL"], 12)
            col_city = find_robust(["CIDADE FILIAL", "CIDADE"], 10)
            col_load_time = find_robust(["HORÁRIO", "HORA"], 15)
            col_technology = find_robust(["TECNOLOGIA", "TECH"], 20)
            col_rateio = find_robust(["RATEIO"], 31)

            total_rows = len(df)
            from datetime import timedelta
            now = br_now()

            batch_size = 500
            for i in range(0, total_rows, batch_size):
                chunk_df = df.iloc[i:i+batch_size]
                chunk_ids = [str(x).strip() for x in chunk_df[col_id].dropna()]
                existing_loads = {l.load_identifier: l for l in bg_db.query(models.Load).filter(models.Load.load_identifier.in_(chunk_ids)).all()}
                known_ids_chunk = {ki[0] for ki in bg_db.query(models.KnownID.load_identifier).filter(models.KnownID.load_identifier.in_(chunk_ids)).all()}
                
                for _, row in chunk_df.iterrows():
                    raw_id = row.get(col_id)
                    if not raw_id or pd.isna(raw_id): continue
                    l_id = str(raw_id).strip()
                    load = existing_loads.get(l_id)
                    is_new = l_id not in known_ids_chunk
                    
                    if not load:
                        load = models.Load(load_identifier=l_id)
                        bg_db.add(load)
                        existing_loads[l_id] = load
                        if is_new: bg_db.add(models.KnownID(load_identifier=l_id, registered_at=now))
                    
                    load.is_urgent = True if is_new else False
                    if is_new: load.arrival_at = now
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

                progress = int(5 + (i / total_rows) * 90)
                set_cfg(bg_db, "processing_progress", progress)
                bg_db.commit()
                bg_db.expire_all()

            validation.run_batch_validation(bg_db)
            set_cfg(bg_db, "last_upload_at", now.strftime("%d/%m/%Y %H:%M:%S"))
            set_cfg(bg_db, "processing_progress", "100")
            set_cfg(bg_db, "is_processing", "false")
            
        except Exception as e:
            import traceback
            print(f"BACKGROUND PROCESSING ERROR: {e}")
            set_cfg(bg_db, "last_validation_error", f"{str(e)}")
            set_cfg(bg_db, "is_processing", "false")
        finally:
            bg_db.close()

class SupabaseUploadRequest(BaseModel):
    file_path: str
    file_name: str
    wipe: bool = True

@app.post("/upload/supabase")
async def upload_supabase_file(
    req: SupabaseUploadRequest,
    bg: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Novo ponto de entrada para arquivos no Supabase Storage."""
    try:
        import uuid
        upload_uuid = str(uuid.uuid4())
        bg.add_task(process_supabase_upload_task, req.file_path, req.file_name, req.wipe, upload_uuid)
        return {
            "status": "background_started",
            "message": f"Processamento Cloud iniciado para {req.file_name}",
            "upload_id": upload_uuid
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def process_supabase_upload_task(storage_path: str, original_filename: str, wipe: bool, upload_uuid: str):
    """Baixa do Storage e aciona o motor SQL atômico."""
    from database import SessionLocal
    bg_db = SessionLocal()
    from sqlalchemy import text
    try:
        print(f"--- [CLOUD] INICIANDO PROCESSAMENTO: {original_filename} ({upload_uuid}) ---")
        set_cfg(bg_db, "is_processing", "true")
        set_cfg(bg_db, "processing_progress", "5")
        set_cfg(bg_db, "active_filename", original_filename)
        
        import requests
        SUPABASE_URL = "https://dipbhkolyebdbvrjedwu.supabase.co"
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/planilhas/{storage_path}"
        
        print(f"--- [CLOUD] BAIXANDO ARQUIVO ... ---")
        resp = requests.get(public_url)
        if resp.status_code != 200:
            raise Exception(f"Download falhou: {resp.status_code}")
            
        content = resp.content
        set_cfg(bg_db, "processing_progress", "10")
        print(f"--- [CLOUD] ARQUIVO BAIXADO ({len(content)} bytes). LENDO DADOS ... ---")

        import io
        import pandas as pd
        file_ext = original_filename.split('.')[-1].lower()
        if file_ext == 'csv':
             df = pd.read_csv(io.BytesIO(content), low_memory=False)
        else:
             df = pd.read_excel(io.BytesIO(content), engine='openpyxl')
             
        set_cfg(bg_db, "processing_progress", "15")
        row_count = len(df)
        print(f"--- [CLOUD] DADOS LIDOS: {row_count} LINHAS ENCONTRADAS. ---")

        # 3. Clean and Batch Insert into STAGING
        if wipe:
            bg_db.execute(text("TRUNCATE TABLE staging_loads RESTART IDENTITY CASCADE"))
            bg_db.execute(text("DELETE FROM loads"))
            bg_db.execute(text("DELETE FROM error_ledger"))
            bg_db.commit()
        
        # --- SMART HEADER DISCOVERY ---
        header_row_idx = -1
        keywords = ['PLACA', 'IDENTIFICADOR', 'PRODUTO', 'PESO', 'DOC', 'DISTRITO']
        
        current_cols = [str(c).upper() for c in df.columns]
        if any(any(k in c for k in keywords) for c in current_cols):
            header_row_idx = -2
            print("--- [CLOUD] CABEÇALHO DETECTADO NA LINHA 0. ---")
        else:
            for i in range(min(20, len(df))):
                row_values = [str(v).upper() for v in df.iloc[i].values if v is not None]
                if any(any(k in v for k in keywords) for v in row_values):
                    header_row_idx = i
                    print(f"--- [CLOUD] CABEÇALHO ENCONTRADO NA LINHA {i+1}. ---")
                    break
        
        if header_row_idx >= 0:
            new_cols = df.iloc[header_row_idx].values
            df = df.iloc[header_row_idx + 1:].copy()
            df.columns = new_cols
            
        df.columns = [str(c).upper().strip() for c in df.columns]
        print(f"--- [CLOUD] COLUNAS DISPONÍVEIS: {list(df.columns)}")
        
        # Robust Column Mapping
        mapping = {
            'visit_code': next((c for c in df.columns if 'CÓDIGO VISITA' in c), None),
            'truck_plate': next((c for c in df.columns if 'PLACA' in c), None),
            'product': next((c for c in df.columns if 'PRODUTOR' in c), None),
            'load_identifier': next((c for c in df.columns if 'ID' == c or 'IDENTIFICADOR' in c), None),
            'doc_number': next((c for c in df.columns if 'NÚMERO DOCUMENTO' in c), None) or next((c for c in df.columns if 'DOC' in c and 'TIPO' not in c), None),
            'weight_gross': next((c for c in df.columns if 'PESO LÍQUIDO (KG)' in c), None),
            'weight_net': next((c for c in df.columns if 'PESO LÍQUIDO C/ DESCONTO' in c), None),
            'load_time': next((c for c in df.columns if 'HORÁRIO' in c or 'HORA' in c), None),
            'district': next((c for c in df.columns if 'DISTRITO FILIAL' in c), None),
            'rateio': next((c for c in df.columns if 'RATEIO' in c), None),
            'technology': next((c for c in df.columns if 'RESULTADO' in c and 'TESTE' in c), None) or next((c for c in df.columns if 'TECNOLOGIA' in c), None),
        }
        
        print("--- [CLOUD] MAPEAMENTO DE COLUNAS: ---")
        for k, v in mapping.items():
            print(f"  {k}: {v}")
            
        rename_map = {v: k for k, v in mapping.items() if v is not None}
        if not rename_map:
            raise Exception("Nenhuma coluna mapeada! Verifique os cabeçalhos.")
            
        # Normalization
        temp_df = df[list(rename_map.keys())].rename(columns=rename_map)
        for col in ['visit_code', 'truck_plate', 'product', 'load_identifier', 'doc_number', 'district', 'rateio', 'technology']:
            if col not in temp_df.columns: temp_df[col] = 'N/A'
            else: temp_df[col] = temp_df[col].astype(str).fillna('N/A')
            
        # Specific Normalization: Strip hyphens from plates
        temp_df['truck_plate'] = temp_df['truck_plate'].str.replace('-', '', regex=False)
            
        if 'load_time' not in temp_df.columns: temp_df['load_time'] = '00:00'
        else: temp_df['load_time'] = temp_df['load_time'].astype(str).fillna('00:00')

        for col in ['weight_gross', 'weight_net']:
            if col not in temp_df.columns: temp_df[col] = '0'
            else:
                temp_df[col] = temp_df[col].astype(str).str.replace(r'[^0-9,.]', '', regex=True)
                temp_df[col] = temp_df[col].replace(['', 'N/A', 'nan'], '0').fillna('0')

        # Limpeza de quebras de linha e tabs que corrompem o comando COPY do Postgres
        for col in temp_df.columns:
            if temp_df[col].dtype == 'object':
                temp_df[col] = temp_df[col].astype(str).str.replace(r'[\n\r\t]', ' ', regex=True).str.strip()

        total_rows = len(temp_df)
        temp_df['upload_id'] = upload_uuid
        print(f"--- [CLOUD] NORMALIZADO: {total_rows} LINHAS. INICIANDO CARGA VIA COPY... ---")
        
        # 4. Use PostgreSQL COPY command for massive performance
        output = io.StringIO()
        # Ensure column order matches staging_loads table
        copy_cols = ['upload_id', 'visit_code', 'truck_plate', 'product', 'load_identifier', 'doc_number', 'weight_gross', 'weight_net', 'load_time', 'district', 'rateio', 'technology']
        temp_df[copy_cols].to_csv(output, sep='\t', header=False, index=False)
        output.seek(0)
        
        # Update progress BEFORE getting raw connection to avoid transaction lock
        set_cfg(bg_db, "processing_progress", "40")
        
        try:
            print("--- [CLOUD] ENVIANDO DADOS AO BANCO (COPY)... ---")
            # Get raw connection directly from engine for COPY
            raw_conn = engine.raw_connection()
            try:
                with raw_conn.cursor() as cursor:
                    cursor.copy_from(output, 'staging_loads', columns=copy_cols)
                raw_conn.commit()
                print(f"--- [CLOUD] CARGA CONCLUÍDA: {total_rows} LINHAS. ---")
            finally:
                raw_conn.close()
                
            set_cfg(bg_db, "processing_progress", "85")
            
        except Exception as copy_err:
            print(f"--- [CLOUD] ERRO NO COMANDO COPY: {copy_err} ---")
            bg_db.rollback()
            # Fallback to batched inserts if COPY fails (though it shouldn't)
            print("--- [CLOUD] TENTANDO FALLBACK PARA INSERT EM LOTES... ---")
            BATCH_SIZE = 1000
            for i in range(0, total_rows, BATCH_SIZE):
                batch_df = temp_df.iloc[i : i + BATCH_SIZE]
                batch_data = batch_df.to_dict('records')
                
                stmt = text("""
                    INSERT INTO staging_loads 
                    (upload_id, visit_code, truck_plate, product, load_identifier, doc_number, weight_gross, weight_net, load_time, district, rateio) 
                    VALUES 
                    (:upload_id, :visit_code, :truck_plate, :product, :load_identifier, :doc_number, :weight_gross, :weight_net, :load_time, :district, :rateio)
                """)
                
                params = []
                for row in batch_data:
                    params.append({**row, "upload_id": upload_uuid})

                try:
                    bg_db.execute(stmt, params)
                    bg_db.commit()
                    progress = 20 + int(((i + len(batch_df)) / total_rows) * 60)
                    set_cfg(bg_db, "processing_progress", str(progress))
                    print(f"--- [CLOUD] PROGRESSO (FALLBACK): {i + len(batch_df)}/{total_rows} ---")
                except Exception as b_err:
                    print(f"--- [CLOUD] FALHA CRÍTICA NO FALLBACK: {b_err} ---")
                    break

        print(f"--- [CLOUD] CARGA COMPLETA. INICIANDO SQL ... ---")
        set_cfg(bg_db, "processing_progress", "90")
        bg_db.execute(text("SELECT validate_and_migrate_loads(:uid)"), {"uid": upload_uuid})
        bg_db.commit()

        set_cfg(bg_db, "processing_progress", "100")
        set_cfg(bg_db, "is_processing", "false")
        bg_db.commit()
        print(f"--- [CLOUD] CONCLUÍDO: {upload_uuid} ---")
    except Exception as e:
        print(f"ERRO CLOUD: {e}")
        try:
            bg_db.rollback()
            set_cfg(bg_db, "is_processing", "false")
            set_cfg(bg_db, "last_validation_error", str(e))
            bg_db.commit()
        except: pass
    finally:
        bg_db.close()

@app.post("/upload")
def upload_file_legacy():
    # Note: In the new cloud flow, this endpoint is legacy.
    # But we keep it functional for small files.
    # To handle 700k, use /upload/supabase (triggered by frontend)
    return {
        "status": "deprecated",
        "message": "Use o novo fluxo Supabase para arquivos grandes."
    }
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
