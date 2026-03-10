from collections import Counter
from rules.utils import extract_rom_parts, parse_time_minutes

def validate_romaneio_context(loads: list, config: dict = None):
    """
    Consolidated batch rules: Rule 1 (Duplicates) and Rule 2 (Statistical Romaneios).
    Groups them by visit context.
    """
    if not loads: return
    delta = config.get('rateio_delta_minutes', 20) if config else 20
    
    # 1. Identify predominant Length and Prefix (Modes) for Rule 2
    rom_data = []
    from collections import defaultdict
    # Track which plates use each romaneio number
    doc_usage = defaultdict(set)
    pair_counts = Counter()
    
    for l in loads:
        plate = str(l.truck_plate or "N/A").strip().upper()
        if l.doc_number != "N/A":
            doc_usage[str(l.doc_number)].add(plate)
        
        # [Existing pair logic for weights remains here]
        if l.weight_gross > 0.1 and l.weight_net > 0.1:
            pair_key = (round(l.weight_gross, 2), round(l.weight_net, 2))
            pair_counts[pair_key] += 1

    # For Rule 1: Standard count for non-rateio internal duplication
    non_rateio_counts = Counter()
    for l in loads:
        rateio_str = str(l.rateio or "NÃO").strip().upper()
        if (rateio_str in ["NÃO", "NAO"]) and l.doc_number != "N/A":
            non_rateio_counts[str(l.doc_number)] += 1

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
        
        rateio_str = str(load.rateio or "NÃO").strip().upper()
        is_rateio_no = rateio_str in ["NÃO", "NAO"]
        plate = str(load.truck_plate or "N/A").strip().upper()

        # Rule 1 (Duplicates) - For NON-RATEIO
        if is_rateio_no and non_rateio_counts[str(load.doc_number)] > 1:
            errs = getattr(load, "_temp_errors", [])
            errs.append(f"Romaneio duplicado nesta visita")
            load._temp_errors = errs

        # Rule 2 (Out of Pattern - Cross Plate Duplication) - For RATEIO
        if not is_rateio_no and load.doc_number != "N/A":
            # If this romaneio is used by MORE THAN ONE unique plate in this visit
            if len(doc_usage[str(load.doc_number)]) > 1:
                errs = getattr(load, "_temp_errors", [])
                errs.append(f"Romaneio fora do padrão: Mesma numeração usada em placas diferentes")
                load._temp_errors = errs
            
        # Pesos Duplicados (Mesma Visita) - REFINED
        # Requirement: Both weights (PL and PLCD) repeat in another load, ONLY for non-rateio
        if is_rateio_no and load.weight_gross > 0.1 and load.weight_net > 0.1:
            pair_key = (round(load.weight_gross, 2), round(load.weight_net, 2))
            if pair_counts[pair_key] > 1:
                errs = getattr(load, "_temp_errors", [])
                errs.append(f"Pesos duplicados (Mesma Visita): Par PL ({load.weight_gross:.2f}) e PLCD ({load.weight_net:.2f}) se repete")
                load._temp_errors = errs
        
    if not rom_data: return

    # Calculate Modes for Rule 2
    lengths = [r["len"] for r in rom_data if r["raw"] != "N/A"]
    prefixes = [r["prefix"] for r in rom_data if r["raw"] != "N/A"]
    
    mode_len = Counter(lengths).most_common(1)[0][0] if lengths else 0
    mode_prefix = Counter(prefixes).most_common(1)[0][0] if prefixes else ""

    # Sort for Jump Analysis and Window Analysis
    rom_data.sort(key=lambda x: parse_time_minutes(x["load"].load_time))

    for i, r in enumerate(rom_data):
        load = r["load"]
        existing_errors = getattr(load, "_temp_errors", [])
        
        # RULE 4: Possible Rateio (Aviso 20min)
        # Logic: Mesma Placa, tecnologia e horario de 20min de diferença
        if str(load.rateio).upper() == "NÃO":
            my_plate = str(load.truck_plate or "").strip().upper()
            my_tech = str(load.technology or "").strip()
            my_t = parse_time_minutes(load.load_time)
            
            # Check neighbors in the sorted list
            for offset in [-1, 1]:
                idx = i + offset
                if 0 <= idx < len(rom_data):
                    neighbor = rom_data[idx]["load"]
                    n_plate = str(neighbor.truck_plate or "").strip().upper()
                    n_tech = str(neighbor.technology or "").strip()
                    n_t = parse_time_minutes(neighbor.load_time)
                    
                    if (my_plate == n_plate and my_tech == n_tech and 
                        my_t >= 0 and n_t >= 0 and abs(my_t - n_t) <= delta):
                        existing_errors.append(f"Possível Rateio: Muito próximo de outro documento ({neighbor.doc_number}) - {delta}min")
                        break

        # A. Numeric Jump (Delta > 500)
        # ... [remaining jump logic preserved] ...

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
