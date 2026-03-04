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
    for l in loads:
        if str(l.rateio).upper() == "NÃO" and l.doc_number != "N/A":
            doc_counts[str(l.doc_number)] += 1

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

    # Process in chunks of 1000 for database stability
    chunk_size = 1000
    for i in range(0, total, chunk_size):
        chunk_ids = pending_ids[i : i + chunk_size]
        loads = db.query(models.Load).filter(models.Load.id.in_(chunk_ids)).all()
        
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
        
        # 2. Individual Rules
        for load in loads:
            success, _ = validate_load(db, load)
            if success: results["success"] += 1
            else: results["error"] += 1
        
        db.commit()
        print(f"--- [PROGRESS] Validated {min(i + chunk_size, total)}/{total} loads... ---")
            
    print(f"--- BATCH DONE: {results['success']} OK, {results['error']} Errors ---")
    return results
