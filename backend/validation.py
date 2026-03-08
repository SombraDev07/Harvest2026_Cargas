from sqlalchemy.orm import Session
import models
from rules.romaneio import validate_romaneio_context
from rules.individual import validate_individual_rules
from rules.rateio import validate_rateio_groups

def validate_load(db: Session, load: models.Load):
    """Orchestrates individual validations and sets status."""
    errors = validate_individual_rules(load)
    
    if errors:
        load.status = "error"
        load.error_message = "; ".join(errors)
        return False, load.error_message
    else:
        load.status = "validated"
        load.error_message = None
        return True, "Validated"

def run_batch_validation(db: Session, district: str = None, limit: int = 1000000):
    """
    Main orchestration engine.
    Groups loads by visit and plate to apply contextual rules first,
    then runs individual checks.
    """
    query = db.query(models.Load.id).filter(models.Load.status.in_(["pending", "error"]))
    if district:
        query = query.filter(models.Load.district == district)
    
    pending_ids = [r[0] for r in query.order_by(models.Load.id.desc()).limit(limit).all()]
    total = len(pending_ids)
    
    results = {"success": 0, "error": 0}
    if not total: return results

    print(f"--- [MODULAR ENGINE] Starting Validation: {total} loads ---")

    # Move registered (ID, ErrorType) pairs outside loop for performance
    registered_pairs = db.query(models.RegisteredLoad.load_identifier, models.RegisteredLoad.error_type).all()
    # Map for O(1) lookup: load_id -> set of error_types to suppress
    suppression_map = {}
    for l_id, e_type in registered_pairs:
        if l_id not in suppression_map: suppression_map[l_id] = set()
        suppression_map[l_id].add(e_type)
    
    chunk_size = 1000
    for i in range(0, total, chunk_size):
        chunk_ids = pending_ids[i : i + chunk_size]
        
        loads = db.query(models.Load).filter(models.Load.id.in_(chunk_ids)).all()
        
        # Reset flags & errors
        for l in loads: l._temp_errors = []
        
        # 1. Group-based Rules (Visit level)
        visits = {}
        for l in loads:
            vcode = str(l.visit_code or "N/A").strip()
            if vcode not in visits: visits[vcode] = []
            visits[vcode].append(l)
        
        for vcode, group in visits.items():
            if vcode != "N/A":
                validate_romaneio_context(group)
                validate_rateio_groups(group)
        
        # 2. Individual Rules & Persistance
        all_new_ledger_entries = []
        chunk_identifiers = [l.load_identifier for l in loads]
        db.query(models.ErrorLedger).filter(models.ErrorLedger.load_identifier.in_(chunk_identifiers)).delete(synchronize_session=False)

        for load in loads:
            # Run all validations
            validate_individual_rules(load)
            
            # Filter matches against suppression_map
            final_errors = []
            suppressed_list = suppression_map.get(load.load_identifier, set())
            
            raw_errors = getattr(load, "_temp_errors", [])
            for msg in raw_errors:
                e_type = "generic"
                if "fora do padrão" in msg: e_type = "documento"
                elif "Divergência Grupo Rateio" in msg: e_type = "rateio_peso"
                elif "sem parceiro" in msg: e_type = "rateio_parceiro"
                elif "Regra Rateio 3" in msg: e_type = "rateio_tech"
                elif "Possível Rateio" in msg: e_type = "rateio_possivel"
                elif "mesma conta" in msg: e_type = "rateio_mesmo_pdr"
                elif "Pesos duplicados" in msg: e_type = "peso_duplicado"
                elif "duplicado" in msg: e_type = "duplicado"
                elif "não preenchido" in msg: e_type = "campos"
                elif "Placa inválida" in msg: e_type = "placa"
                elif "limite" in msg: e_type = "peso_limite"
                elif "fictício" in msg: e_type = "peso_ficticio"
                elif "Desconto" in msg: e_type = "desconto"
                
                # Check if this ID + THIS Type is suppressed
                # Or if the ID has a generic suppression (error_type is None)
                if e_type in suppressed_list or None in suppressed_list:
                    continue
                
                final_errors.append((e_type, msg))

            # Update Load object state
            if not final_errors:
                load.status = "validated"
                load.error_message = None
                results["success"] += 1
            else:
                load.status = "error"
                load.error_message = "; ".join([e[1] for e in final_errors])
                results["error"] += 1
                for e_type, msg in final_errors:
                    all_new_ledger_entries.append(models.ErrorLedger(
                        load_identifier=load.load_identifier,
                        district=load.district,
                        error_type=e_type,
                        error_message=msg
                    ))
        
        if all_new_ledger_entries:
            db.bulk_save_objects(all_new_ledger_entries)
            
        db.commit()
        print(f"--- [PROGRESS] Validated {min(i + chunk_size, total)}/{total} loads... ---")
              
    print(f"--- MODULES DONE: {results['success']} OK, {results['error']} Errors ---")
    return results
