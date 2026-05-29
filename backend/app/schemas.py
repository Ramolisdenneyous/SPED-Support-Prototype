from pydantic import BaseModel


class TickRequest(BaseModel):
    student_id: str | None = None
    scripted_event: str | None = None
