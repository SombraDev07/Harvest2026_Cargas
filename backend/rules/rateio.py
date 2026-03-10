from rules.utils import parse_time_minutes, normalize_str

def validate_rateio_groups(loads: list, config: dict = None):
    """
    Advanced Rateio Rules (Group Context):
    1. PLCD Integrity (Sum PLCD <= Sum PL, check 10kg diff)
    2. Missing Partner (marked SIM but no pair)
    3. Tech Mismatch (same group, different techs)
    4. Possible Rateio (marked NO but very close to another)
    """
    if not loads: return
    delta = config.get('rateio_delta_minutes', 50) if config else 50

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
        # Increased to 50 minutes as per user request
        sub_groups = []
        if group:
            current_sub = [group[0]]
            for idx in range(1, len(group)):
                prev = group[idx-1]
                curr = group[idx]
                t_prev = parse_time_minutes(prev.load_time)
                t_curr = parse_time_minutes(curr.load_time)
                
                # Group by: same tech AND within delta minutes
                if (t_prev >= 0 and t_curr >= 0 and (t_curr - t_prev) <= delta and 
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
                total_plcd = sum(l.weight_net for l in sub)
                
                unique_techs = list(set(l.technology for l in sub if l.technology != "N/A"))
                
                # RULE 1: PLCD Integrity (Group Sum)
                # Logic: Total PLCD from 'SIM' loads cannot exceed Total PL from the same group
                if count_sim >= 1:
                    total_window_pl = sum(l.weight_gross for l in sub if str(l.rateio).upper() == "SIM")
                    total_window_plcd = sum(l.weight_net for l in sub if str(l.rateio).upper() == "SIM")
                    
                    if total_window_plcd > total_window_pl + 0.1: # 0.1 margin for float rounding
                        for l in sub:
                            if str(l.rateio).upper() == "SIM":
                                errs = getattr(l, "_temp_errors", [])
                                errs.append(f"Divergência Grupo Rateio: Soma PLCD ({total_window_plcd:.2f}) > Soma PL ({total_window_pl:.2f})")
                                l._temp_errors = errs

                # RULE 2: Missing Partner (SIM Isolado)
                # Logic: Marked SIM, but no other load with same plate/tech in delta
                if count_sim == 1:
                    lone_rateio = next(l for l in sub if str(l.rateio).upper() == "SIM")
                    errs = getattr(lone_rateio, "_temp_errors", [])
                    errs.append(f"Rateio sem parceiro: Marcado SIM mas não encontrado par na mesma placa/tempo ({delta}min)")
                    lone_rateio._temp_errors = errs

                # ... [RULE 3: Tech Mismatch omitted] ...

                # NEW RULE: Rateio Mesmo Produtor (Normalized)
                # Logic: SIM + Placa + Tec + delta + Mesmo Nome
                if count_sim >= 2:
                    producers_sim = [normalize_str(l.product) for l in sub if str(l.rateio).upper() == "SIM"]
                    if len(producers_sim) > 1 and len(set(producers_sim)) < len(producers_sim):
                        for l in sub:
                            if str(l.rateio).upper() == "SIM":
                                errs = getattr(l, "_temp_errors", [])
                                errs.append(f"Rateio mesma conta: PDR ({l.product}) repetido no grupo SIM ({delta}min)")
                                l._temp_errors = errs

                # RULE: Group Excessive Discount
                # Logic: If multiple producers, check total group break %
                unique_producers = set(normalize_str(l.product) for l in sub if l.product)
                if len(unique_producers) > 1:
                    total_g_gross = sum(l.weight_gross for l in sub)
                    total_g_net = sum(l.weight_net for l in sub)
                    if total_g_gross > 0.1:
                        group_discount = (total_g_gross - total_g_net) / total_g_gross
                        if group_discount > 0.25:
                            for l in sub:
                                errs = getattr(l, "_temp_errors", [])
                                errs.append(f"Desconto excessivo do Grupo ({group_discount:.1%})")
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
                            # Using 20 as base or smaller portion of delta for Possible Rateio
                            # Let's use config delta if provided, or default to 20
                            p_delta = config.get('rateio_delta_minutes', 20) if config else 20
                            if my_t >= 0 and nt_t >= 0 and abs(my_t - nt_t) <= p_delta:
                                errs = getattr(l, "_temp_errors", [])
                                errs.append(f"Possível Rateio: Muito próximo de outro documento ({n.doc_number}) - {p_delta}min")
                                l._temp_errors = errs
                                break
