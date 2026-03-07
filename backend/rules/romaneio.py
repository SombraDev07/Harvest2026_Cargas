from collections import Counter
from .utils import extract_rom_parts

def validate_romaneio_context(loads: list):
    """
    Consolidated batch rules: Rule 1 (Duplicates) and Rule 2 (Statistical Romaneios).
    Groups them by visit context.
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
        
        # Rule 1 (Duplicates)
        if doc_counts[str(load.doc_number)] > 1 and str(load.rateio).upper() == "NÃO":
            errs = getattr(load, "_temp_errors", [])
            errs.append(f"Romaneio duplicado nesta visita")
            load._temp_errors = errs
            
        # New Rule (Peso Duplicado)
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
