from sqlalchemy.orm import Session
import models
from rules.romaneio import validate_romaneio_context
from rules.individual import validate_individual_rules
from rules.rateio import validate_rateio_groups
from rules.utils import parse_time_minutes

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
    Groups loads by VISIT CODE to ensure contextual rules (Rateio/Romaneio) 
    have full visibility of group partners, preventing false positives.
    """
    # 1. Identify WHICH visits need auditing (those with pending or error loads)
    query = db.query(models.Load.visit_code).filter(models.Load.status.in_(["pending", "error"]))
    if district:
        query = query.filter(models.Load.district == district)
    
    # We use a set to get unique visit codes that need attention
    visits_to_audit = [r[0] for r in query.distinct().limit(limit).all()]
    total_batch_visits = len(visits_to_audit)
    
    # 0. Fetch Config for dynamic rules
    configs = db.query(models.SystemConfig).all()
    config_dict = {c.key: c.value for c in configs}
    # Ensure numeric types
    try:
        config_dict['rateio_delta_minutes'] = int(config_dict.get('rateio_delta_minutes', 50))
    except:
        config_dict['rateio_delta_minutes'] = 50

    results = {"success": 0, "error": 0}
    if not total_batch_visits: return results

    print(f"--- [GROUP ENGINE] Auditing {total_batch_visits} unique visits ---")

    # Suppression map (ID + ErrorType) for O(1) lookup
    registered_pairs = db.query(models.RegisteredLoad.load_identifier, models.RegisteredLoad.error_type).all()
    suppression_map = {}
    for l_id, e_type in registered_pairs:
        if l_id not in suppression_map: suppression_map[l_id] = set()
        suppression_map[l_id].add(e_type)
    
    chunk_size = 500 # Slightly smaller chunks because we fetch ALL loads per visit
    for i in range(0, total_batch_visits, chunk_size):
        chunk_visit_codes = visits_to_audit[i : i + chunk_size]
        
        # 2. Fetch ALL loads for these visits (even if already validated) to ensure context
        # This is the "Full Visibility" key fix.
        all_loads_in_chunk = db.query(models.Load).filter(models.Load.visit_code.in_(chunk_visit_codes)).all()
        
        # Reset temp errors for everyone in this chunk
        for l in all_loads_in_chunk: l._temp_errors = []
        
        # Group by visit for rule application
        visit_groups = {}
        for l in all_loads_in_chunk:
            vcode = str(l.visit_code or "N/A").strip()
            if vcode not in visit_groups: visit_groups[vcode] = []
            visit_groups[vcode].append(l)
        
        # 3. Apply Group-based Rules (Visit level)
        for vcode, group in visit_groups.items():
            if vcode != "N/A":
                # Ensure the group is sorted by time for context rules
                group.sort(key=lambda x: parse_time_minutes(x.load_time))
                validate_romaneio_context(group, config_dict)
                validate_rateio_groups(group, config_dict)
        
        # 4. Individual Rules & Persistance
        all_new_ledger_entries = []
        # We only want to update/delete from ledger for loads that were in our chunk
        chunk_identifiers = [l.load_identifier for l in all_loads_in_chunk if l.load_identifier]
        db.query(models.ErrorLedger).filter(models.ErrorLedger.load_identifier.in_(chunk_identifiers)).delete(synchronize_session=False)

        for load in all_loads_in_chunk:
            # Run individual rules
            validate_individual_rules(load)
            
            # Filter matches against suppression
            final_errors = []
            suppressed_list = suppression_map.get(load.load_identifier, set())
            
            raw_errors = getattr(load, "_temp_errors", [])
            for msg in raw_errors:
                e_type = "generic"
                if "fora do padrão" in msg: e_type = "documento"
                elif "Divergência Grupo Rateio" in msg: e_type = "rateio_peso"
                elif "Alerta Capacidade" in msg: e_type = "peso_limite"
                elif "Alerta Clone" in msg: e_type = "rateio_parceiro"
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
                
                if e_type in suppressed_list or None in suppressed_list:
                    continue
                
                final_errors.append((e_type, msg))

            # Update Load status
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
        
        # Calculate and save progress
        progress_val = int((min(i + chunk_size, total_batch_visits) / total_batch_visits) * 100) if total_batch_visits > 0 else 100
        prg = db.query(models.SystemConfig).filter(models.SystemConfig.key == "processing_progress").first()
        if prg: prg.value = str(progress_val)
        else: db.add(models.SystemConfig(key="processing_progress", value=str(progress_val)))
        db.commit()
        
        print(f"--- [PROGRESS] Validated {min(i + chunk_size, total_batch_visits)}/{total_batch_visits} visits ({progress_val}%)... ---")
              
    print(f"--- GROUP ENGINE DONE: {results['success']} OK, {results['error']} Errors ---")
    return results
