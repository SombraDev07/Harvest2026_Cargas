import re
import models
from rules.utils import extract_rom_parts

def validate_individual_rules(load: models.Load):
    """
    Individual rules (Calculations and Field checks).
    Rules 3, 4, 5, 6, 7
    """
    errors = getattr(load, "_temp_errors", [])

    # RULE 3: Mandatory Fields
    if not load.product or load.product == "N/A": errors.append("Produtor não preenchido")
    if not load.doc_number or load.doc_number == "N/A": errors.append("Romaneio não preenchido")
    if load.weight_gross == 0 and load.weight_net == 0: errors.append("Pesos não preenchidos")

    # RULE 4: Plate
    clean_plate = re.sub(r'[^A-Z0-9]', '', str(load.truck_plate).upper())
    if not clean_plate or clean_plate == "" or clean_plate == "NA" or clean_plate == "N/A":
        errors.append("Placa inválida (não preenchida)")
    elif len(clean_plate) < 7:
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
    if str(load.rateio).upper() == "NÃO":
        if load.weight_gross > 0.1 and load.weight_net > 0.1:
            diff = load.weight_gross - load.weight_net
            discount_perc = diff / load.weight_gross
            if discount_perc > 0.25:
                errors.append(f"Desconto excessivo ({discount_perc:.1%})")

    load._temp_errors = errors
    return errors
