from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Student(SQLModel, table=True):
    id: str = Field(primary_key=True)
    display_name: str
    profile_type: str
    current_status: str = "working"
    alert_level: str = "none"
    focus_score: int = 12
    confusion_score: int = 7
    progress_score: int = 35
    off_task_score: int = 5
    engagement_level: int = 75
    accommodation_flags: dict = Field(default_factory=dict, sa_column=Column(JSON))
    minder_summary: str = ""
    tutor_summary: str = "Tutor subsystem placeholder: no live AI tutoring is connected."
    recommended_action: str = "Monitor progress."
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class Assignment(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str
    description: str
    due_at: datetime
    simulated_course: str
    created_at: datetime = Field(default_factory=now_utc)


class StudentAssignmentState(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: str = Field(index=True, foreign_key="student.id")
    assignment_id: str = Field(index=True, foreign_key="assignment.id")
    progress_percent: int = 0
    status: str = "not_started"
    last_activity_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class MinderEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: str = Field(index=True, foreign_key="student.id")
    event_type: str
    severity: str = "low"
    message: str
    raw_data_json: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=now_utc, index=True)


class TutorEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: str = Field(index=True, foreign_key="student.id")
    event_type: str
    severity: str = "low"
    message: str
    raw_data_json: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=now_utc, index=True)


class DashboardSnapshot(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    snapshot_json: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=now_utc, index=True)
