from rules.utils import parse_time_minutes

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
    plate_groups = {}
    for l in loads:
        plate = str(l.truck_plate or "").replace("-", "").replace(" ", "").strip().upper()
        if plate not in plate_groups: plate_groups[plate] = []
        plate_groups[plate].append(l)

    for plate, group in plate_groups.items():
        if plate == "N/A" or not plate: continue
        
        # Sort by load_time minutes
        group.sort(key=lambda x: parse_time_minutes(x.load_time))
        
        # B. Sub-grouping: Rolling Window
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
            # Stats for this window
            count_sim = sum(1 for l in sub if str(l.rateio).strip().upper() == "SIM")
            count_nao = sum(1 for l in sub if str(l.rateio).strip().upper() == "NÃO")
            total_pl = sum(l.weight_gross for l in sub)
            total_plcd = sum(l.weight_net for l in sub)
            
            unique_techs = list(set(l.technology for l in sub if l.technology != "N/A"))
            
            # RULE 1: PLCD Integrity (Physical Constraint)
            # Legitimate Rateio: Max(Gross) must cover Sum(Net)
            reference_gross = max(l.weight_gross for l in sub) if sub else 0
            
            if count_sim > 0 and total_plcd > (reference_gross + 1): 
                for l in sub:
                    errs = getattr(l, "_temp_errors", [])
                    errs.append(f"Divergência Grupo Rateio: Total PLCD ({total_plcd:.2f}) excede Peso Bruto do caminhão ({reference_gross:.2f})")
                    l._temp_errors = errs
            
            # RULE: Global Capacity (Single Truck Limit)
            if total_plcd > 52000:
                for l in sub:
                    errs = getattr(l, "_temp_errors", [])
                    errs.append(f"Alerta Capacidade: Soma do grupo ({total_plcd:.2f}kg) excede o limite físico do transporte (52k kg)")
                    l._temp_errors = errs

            # Alerta Suspeito: Se marcou 2 SIM e o total bate quase exato (ex: clone sem desconto)
            elif count_sim >= 2 and abs(reference_gross - total_plcd) <= 10:
                for l in sub:
                    errs = getattr(l, "_temp_errors", [])
                    errs.append(f"Alerta Rateio: Perda suspeita de apenas 10kg no grupo (Total: {reference_gross:.2f})")
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

            # NEW RULE: Rateio Same Producer
            if count_sim >= 2:
                producers_sim = [l.product for l in sub if str(l.rateio).upper() == "SIM"]
                if len(producers_sim) > 1 and len(set(producers_sim)) < len(producers_sim):
                    for l in sub:
                        if str(l.rateio).upper() == "SIM":
                            errs = getattr(l, "_temp_errors", [])
                            errs.append(f"Rateio mesma conta: PDR ({l.product}) repetido no grupo SIM")
                            l._temp_errors = errs

            # RULE 4: Possible Rateio
            if count_nao >= 1:
                for idx, l in enumerate(sub):
                    if str(l.rateio).upper() == "NÃO":
                        neighbors = []
                        if idx > 0: neighbors.append(sub[idx-1])
                        if idx < len(sub)-1: neighbors.append(sub[idx+1])
                        
                        my_t = parse_time_minutes(l.load_time)
                        for n in neighbors:
                            nt_t = parse_time_minutes(n.load_time)
                            if my_t >= 0 and nt_t >= 0 and abs(my_t - nt_t) <= 20:
                                errs = getattr(l, "_temp_errors", [])
                                errs.append(f"Possível Rateio: Muito próximo de outro documento ({n.doc_number})")
                                l._temp_errors = errs
                                break
