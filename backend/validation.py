from sqlalchemy.orm import Session
import models
from datetime import datetime
from collections import Counter
import re

def extract_rom_parts(rom_str):
    """Extract numeric part and prefix from romaneio string."""
    if not rom_str or rom_str == "N/A":
        return 0, ""
    
    # Simple regex to separate prefix and digits
    # example: KMA2955220 -> prefix: KMA, num: 2955220
    match = re.search(r'([A-Za-z]*)(\d+)', str(rom_str))
    if match:
        prefix = match.group(1)
        num = int(match.group(2))
        return num, prefix
    
    # Try to just get digits if no prefix found
    digits = re.sub(r'\D', '', str(rom_str))
    return int(digits) if digits else 0, ""

def validate_batch_context(loads: list):
    """
    Consolidated batch rules: Rule 1 (Duplicates) and Rule 2 (Statistical Romaneios).
    Groups them by visit context to avoid thousands of DB queries.
    """
    if not loads: return
    
    # 1. Identify predominant Length and Prefix (Modes) for Rule 2
    rom_data = []
    # For Rule 1: Find duplicates within this group
    doc_counts = Counter()
    gross_counts = Counter()
    net_counts = Counter()
    for l in loads:
        is_rateio_no = str(l.rateio).upper() == "NÃO"
        if is_rateio_no and l.doc_number != "N/A":
            doc_counts[str(l.doc_number)] += 1
        
        # New Rule: Peso Duplicado (within same visit)
        # We only count if weight > 10kg AND rateio is 'NÃO' per user request
        if is_rateio_no:
            if l.weight_gross > 10: gross_counts[l.weight_gross] += 1
            if l.weight_net > 10: net_counts[l.weight_net] += 1

    for load in loads:
        doc = str(load.doc_number or "")
        num, prefix = extract_rom_parts(doc)
        rom_data.append({
            "load": load,
            "raw": doc,
            "num": num,
            "prefix": prefix,
            "len": len(doc)
        })
        
        # Rule 1 (Duplicates) - Tagging here
        if doc_counts[str(load.doc_number)] > 1 and str(load.rateio).upper() == "NÃO":
            errs = getattr(load, "_temp_errors", [])
            errs.append(f"Romaneio duplicado nesta visita")
            load._temp_errors = errs
            
        # New Rule (Peso Duplicado) - Tagging here
        is_dup_gross = gross_counts[load.weight_gross] > 1 if load.weight_gross > 10 else False
        is_dup_net = net_counts[load.weight_net] > 1 if load.weight_net > 10 else False
        
        if is_dup_gross or is_dup_net:
            errs = getattr(load, "_temp_errors", [])
            dup_val = load.weight_gross if is_dup_gross else load.weight_net
            errs.append(f"Pesos duplicados (Mesma Visita): Valor {dup_val:.2f} se repete")
            load._temp_errors = errs
        
    if not rom_data: return

    # Calculate Modes for Rule 2
    lengths = [r["len"] for r in rom_data if r["raw"] != "N/A"]
    prefixes = [r["prefix"] for r in rom_data if r["raw"] != "N/A"]
    
    mode_len = Counter(lengths).most_common(1)[0][0] if lengths else 0
    mode_prefix = Counter(prefixes).most_common(1)[0][0] if prefixes else ""

    # Sort for Jump Analysis
    rom_data.sort(key=lambda x: x["num"])

    for i, r in enumerate(rom_data):
        load = r["load"]
        existing_errors = getattr(load, "_temp_errors", [])
        
        # A. Numeric Jump (Delta > 500)
        if i > 0:
            prev = rom_data[i-1]
            delta = abs(r["num"] - prev["num"])
            if delta > 500 and r["raw"] != "N/A" and prev["raw"] != "N/A":
                existing_errors.append(f"Salto de Romaneio fora do padrão ({prev['raw']} -> {r['raw']})")

        # B. Length Anomaly
        if r["len"] != mode_len and r["raw"] != "N/A":
            prev_dist = abs(r["num"] - rom_data[i-1]["num"]) if i > 0 else 9999
            next_dist = abs(rom_data[i+1]["num"] - r["num"]) if i < len(rom_data)-1 else 9999
            if prev_dist > 100 and next_dist > 100:
                existing_errors.append(f"Romaneio fora do padrão de dígitos ({r['raw']})")

        # C. Prefix Divergence
        if r["prefix"] != mode_prefix and r["raw"] != "N/A" and len(rom_data) >= 3:
            existing_errors.append(f"Prefixo fora do padrão ({r['raw']}). Esperado: {mode_prefix}")

        load._temp_errors = existing_errors

def validate_load(db: Session, load: models.Load):
    """
    Individual rules (Calculations and Field checks).
    """
    errors = getattr(load, "_temp_errors", [])

    # RULE 3: Mandatory Fields
    if not load.product or load.product == "N/A": errors.append("Produtor não preenchido")
    if not load.doc_number or load.doc_number == "N/A": errors.append("Romaneio não preenchido")
    if load.weight_gross == 0 and load.weight_net == 0: errors.append("Pesos não preenchidos")

    # RULE 4: Plate
    clean_plate = re.sub(r'[^A-Z0-9]', '', str(load.truck_plate).upper())
    if not clean_plate or clean_plate == "" or clean_plate == "NA":
        errors.append("Placa inválida (não preenchida)")
    elif len(clean_plate) != 7:
        errors.append(f"Placa inválida ({len(clean_plate)} caracteres)")

    # RULE 5: Max weight
    if load.weight_gross > 52000 or load.weight_net > 52000:
        errors.append("Peso acima do limite permitido (52k kg)")

    # RULE 6: Fictive patterns
    fictive_patterns = [999, 1000]
    for w in [load.weight_gross, load.weight_net]:
        w_int = int(w)
        if any(str(w_int).endswith(str(p)) for p in fictive_patterns):
            errors.append(f"Possível peso fictício detectado ({w_int})")
            break

    # RULE 7: Excessive Discount (STRICT GUARD)
    # Ignore if PLCD is zero or empty (usually <= 0.1 since they are floats)
    if str(load.rateio).upper() == "NÃO":
        if load.weight_gross > 0.1 and load.weight_net > 0.1:
            diff = load.weight_gross - load.weight_net
            discount_perc = diff / load.weight_gross
            if discount_perc > 0.25:
                errors.append(f"Desconto excessivo ({discount_perc:.1%}) sem rateio")

    if errors:
        load.status = "error"
        load.error_message = "; ".join(errors)
        return False, load.error_message
    else:
        load.status = "validated"
        load.error_message = None
        return True, "Validated"

def parse_time_minutes(time_str: str) -> int:
    """Safely convert HH:MM or HH:MM:SS to absolute minutes from 00:00."""
    if not time_str or time_str == "N/A": return -999
    try:
        # Handle cases like "10:30:00" or "08:15"
        parts = str(time_str).split(":")
        if len(parts) >= 2:
            return int(parts[0]) * 60 + int(parts[1])
    except: pass
    return -999

def validate_rateio_groups(loads: list):
    """
    Advanced Rateio Rules (Group Context):
    1. PLCD Integrity (Sum PLCD <= Sum PL, check 10kg diff)
    2. Missing Partner (marked SIM but no pair)
    3. Tech Mismatch (same group, different techs)
    4. Possible Rateio (marked NO but very close to another)
    """
    if not loads: return

    # A. Initial Grouping: Visit + Plate
    # We group by Plate within the current session's loads
    plate_groups = {}
    for l in loads:
        # Normalize plate: remove hyphens and spaces to treat "ABC-123" same as "ABC 123" or "ABC123"
        plate = str(l.truck_plate or "").replace("-", "").replace(" ", "").strip().upper()
        if plate not in plate_groups: plate_groups[plate] = []
        plate_groups[plate].append(l)

    for plate, group in plate_groups.items():
        if plate == "N/A" or not plate: continue
        
        # Sort by load_time minutes
        group.sort(key=lambda x: parse_time_minutes(x.load_time))
        
        # B. Sub-grouping: 50-minute Rolling Window
        sub_groups = []
        if group:
            current_sub = [group[0]]
            for idx in range(1, len(group)):
                prev = group[idx-1]
                curr = group[idx]
                t_prev = parse_time_minutes(prev.load_time)
                t_curr = parse_time_minutes(curr.load_time)
                
                # Group by: same tech AND within 40 minutes
                if (t_prev >= 0 and t_curr >= 0 and (t_curr - t_prev) <= 40 and 
                    prev.technology == curr.technology):
                    current_sub.append(curr)
                else:
                    sub_groups.append(current_sub)
                    current_sub = [curr]
            sub_groups.append(current_sub)

        # C. Apply Per-Group Rules
        for sub in sub_groups:
            # Stats for this 40min window
            count_sim = sum(1 for l in sub if str(l.rateio).strip().upper() == "SIM")
            count_nao = sum(1 for l in sub if str(l.rateio).strip().upper() == "N\u00c3O")
            total_pl = sum(l.weight_gross for l in sub)
            total_plcd = sum(l.weight_net for l in sub)
            
            unique_techs = list(set(l.technology for l in sub if l.technology != "N/A"))
            
            # RULE 1: PLCD Integrity (Trigger ONLY if it represents a rateio and Sum PLCD > Sum PL)
            if count_sim > 0 and total_plcd > (total_pl + 1): # 1kg tolerance 
                for l in sub:
                    errs = getattr(l, "_temp_errors", [])
                    errs.append(f"Divergência Grupo Rateio: Total PLCD ({total_plcd:.2f}) > Peso ({total_pl:.2f})")
                    l._temp_errors = errs
            elif count_sim >= 2 and abs(total_pl - total_plcd) <= 10:
                for l in sub:
                    errs = getattr(l, "_temp_errors", [])
                    errs.append(f"Alerta Rateio: Perda suspeita de apenas 10kg no grupo (Total: {total_pl:.2f})")
                    l._temp_errors = errs

            # RULE 2: Missing Partner
            if count_sim == 1:
                lone_rateio = next(l for l in sub if str(l.rateio).upper() == "SIM")
                errs = getattr(lone_rateio, "_temp_errors", [])
                errs.append("Rateio sem parceiro: Marcado SIM mas não encontrado par na mesma placa/tempo")
                lone_rateio._temp_errors = errs

            # RULE 3: Tech Mismatch
            if len(unique_techs) > 1 and count_sim >= 1:
                for l in sub:
                    errs = getattr(l, "_temp_errors", [])
                    errs.append(f"Regra Rateio 3: Mais de uma tecnologia ({', '.join(unique_techs)}) no mesmo grupo")
                    l._temp_errors = errs

            # NEW RULE: Rateio Same Producer (Suspicious if same producer on both sides of a SIM)
            if count_sim >= 2:
                producers_sim = [l.product for l in sub if str(l.rateio).upper() == "SIM"]
                if len(producers_sim) > 1 and len(set(producers_sim)) < len(producers_sim):
                    for l in sub:
                        if str(l.rateio).upper() == "SIM":
                            errs = getattr(l, "_temp_errors", [])
                            errs.append(f"Rateio mesma conta: PDR ({l.product}) repetido no grupo SIM")
                            l._temp_errors = errs

            # RULE 4: Possible Rateio (marked NO but close to another < 20min) - Updated to 20min per user
            if count_nao >= 1:
                # Re-check specifically for 15min proximity if flagged as NO
                for idx, l in enumerate(sub):
                    if str(l.rateio).upper() == "NÃO":
                        # Check neighbors in the subgroup
                        neighbors = []
                        if idx > 0: neighbors.append(sub[idx-1])
                        if idx < len(sub)-1: neighbors.append(sub[idx+1])
                        
                        my_t = parse_time_minutes(l.load_time)
                        for n in neighbors:
                            nt_t = parse_time_minutes(n.load_time)
                            if my_t >= 0 and nt_t >= 0 and abs(my_t - nt_t) <= 20: # User mentioned 20min now
                                errs = getattr(l, "_temp_errors", [])
                                errs.append(f"Possível Rateio: Muito próximo de outro documento ({n.doc_number})")
                                l._temp_errors = errs
                                break

def run_batch_validation(db: Session, district: str = None, limit: int = 1000000):
    # Fetch IDs first to avoid memory bloat with 80k objects
    query = db.query(models.Load.id).filter(models.Load.status.in_(["pending", "error"]))
    if district:
        query = query.filter(models.Load.district == district)
    
    pending_ids = [r[0] for r in query.order_by(models.Load.id.desc()).limit(limit).all()]
    total = len(pending_ids)
    print(f"--- STARTING BATCH VALIDATION: {total} loads ---")
    
    results = {"success": 0, "error": 0}
    if not total: return results

    # EXCLUDE REGISTERED IDs (AJUSTE 1)
    # Move outside loop to avoid redundant DB queries per chunk
    registered_ids = [r[0] for r in db.query(models.RegisteredLoad.load_identifier).all()]
    
    # Process in chunks of 1000 for database stability
    chunk_size = 1000
    for i in range(0, total, chunk_size):
        chunk_ids = pending_ids[i : i + chunk_size]
        
        loads = db.query(models.Load).filter(
            models.Load.id.in_(chunk_ids),
            ~models.Load.load_identifier.in_(registered_ids)
        ).all()
        
        # Reset flags
        for l in loads: l._temp_errors = []
        
        # 1. Group by Visit Code for Batch Rules
        visits = {}
        for l in loads:
            vcode = str(l.visit_code or "N/A").strip()
            if vcode not in visits: visits[vcode] = []
            visits[vcode].append(l)
        
        for vcode, group in visits.items():
            if vcode != "N/A":
                validate_batch_context(group)
                validate_rateio_groups(group) # NEW: Integrated Advanced Rateio
        
        # 2. Individual Rules
        all_new_entries = []
        
        # BATCH DELETE old ledger entries for this chunk's loads to avoid N+1 deletes
        chunk_identifiers = [l.load_identifier for l in loads]
        db.query(models.ErrorLedger).filter(models.ErrorLedger.load_identifier.in_(chunk_identifiers)).delete(synchronize_session=False)

        for load in loads:
            success, _ = validate_load(db, load)
            if success: 
                results["success"] += 1
            else: 
                results["error"] += 1
                # PERSIST TO HISTORICAL LEDGER
                if load.error_message:
                    # Split combined error messages to log each rule violation separately
                    error_msgs = [m.strip() for m in str(load.error_message).split(";") if m.strip()]
                    for msg in error_msgs:
                        # Categorize by absolute statsKey used in modern frontend
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
                        
                        all_new_entries.append(models.ErrorLedger(
                            load_identifier=load.load_identifier,
                            district=load.district,
                            error_type=e_type,
                            error_message=msg
                        ))
        
        # BULK INSERT all errors for this chunk
        if all_new_entries:
            db.bulk_save_objects(all_new_entries)
            
        db.commit()
        print(f"--- [PROGRESS] Validated {min(i + chunk_size, total)}/{total} loads... Ledger Updated. ---")
             
    print(f"--- BATCH DONE: {results['success']} OK, {results['error']} Errors ---")
    return results
