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
    technology: Optional[str] = "N/A"
    load_time: Optional[str] = "N/A"
    weight_gross: float = 0.0
    weight_net: float = 0.0
    status: str = "pending"
    updated_at: Optional[datetime] = None

class LoadCreate(LoadBase):
    pass

class LoadResponse(LoadBase):
    id: int
    timestamp: datetime
    arrival_at: Optional[datetime] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True

class DistrictStats(BaseModel):
    name: str
    total_loads: int
    error_loads: int
    error_rate: float
    top_error: Optional[str] = "Nenhum"
    top_error_count: Optional[int] = 0

class AnalyticsSummary(BaseModel):
    total_loads: int
    validated_loads: int
    pending_loads: int
    error_loads: int
    operation_loads: int
    total_weight: float
    rule_breakdown: dict
    district_performance: List[DistrictStats]

class AnalysisCreate(BaseModel):
    rule_filter: str
    user_name: str

class AnalysisStatus(BaseModel):
    rule_filter: str
    user_name: str
    started_at: datetime

    class Config:
        from_attributes = True

class RegisteredLoadCreate(BaseModel):
    visit_code: str
    load_identifier: str
    error_type: Optional[str] = None
    column_name: str
    user_name: str
    reason: str

class RegisteredLoadResponse(RegisteredLoadCreate):
    id: int
    timestamp: datetime
    class Config:
        from_attributes = True

class OperationTrackingCreate(BaseModel):
    visit_code: str

class OperationTrackingResponse(OperationTrackingCreate):
    id: int
    timestamp: datetime
    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    id: int
    username: str
    role: str
    token: str # Simulated token for now
