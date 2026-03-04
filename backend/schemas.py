from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class LoadBase(BaseModel):
    load_identifier: str
    truck_plate: str
    product: str
    district: str
    visit_code: Optional[str] = "N/A"
    doc_number: Optional[str] = "N/A"
    city: Optional[str] = "N/A"
    cnpj_filial: Optional[str] = "N/A"
    rateio: Optional[str] = "NÃO"
    weight_gross: float = 0.0
    weight_net: float = 0.0
    status: str = "pending"

class LoadCreate(LoadBase):
    pass

class LoadResponse(LoadBase):
    id: int
    timestamp: datetime
    error_message: Optional[str] = None

    class Config:
        from_attributes = True

class DistrictStats(BaseModel):
    name: str
    total_loads: int
    error_loads: int
    error_rate: float

class AnalyticsSummary(BaseModel):
    total_loads: int
    validated_loads: int
    pending_loads: int
    error_loads: int
    total_weight: float
    rule_breakdown: dict
    district_performance: List[DistrictStats]
