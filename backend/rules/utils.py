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
