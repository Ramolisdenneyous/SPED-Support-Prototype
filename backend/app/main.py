import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from .database import create_db_and_tables, engine, get_session
from .logic import tick_next_student
from .models import (
    Assignment,
    DashboardSnapshot,
    MinderEvent,
    Student,
    StudentAssignmentState,
    TutorEvent,
    now_utc,
)
from .schemas import TickRequest
from .seed import ensure_seed_data, reset_demo_data
from .simulator_control import SimulatorController


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("sped-support-backend")
simulator = SimulatorController()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting backend and preparing database.")
    create_db_and_tables()
    with Session(engine) as session:
        ensure_seed_data(session)
    yield
    simulator.stop()


app = FastAPI(title="SPED Support Swarm Prototype API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "sped-support-backend", "time": now_utc().isoformat()}


@app.get("/students")
def list_students(session: Session = Depends(get_session)) -> list[dict]:
    students = session.exec(select(Student).order_by(Student.id)).all()
    return [student_payload(session, student, include_events=False) for student in students]


@app.get("/students/{student_id}")
def get_student(student_id: str, session: Session = Depends(get_session)) -> dict:
    student = session.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student_payload(session, student, include_events=True)


@app.get("/students/{student_id}/events")
def get_student_events(student_id: str, session: Session = Depends(get_session)) -> dict:
    if not session.get(Student, student_id):
        raise HTTPException(status_code=404, detail="Student not found")
    return {
        "minder_events": [
            event.model_dump(mode="json")
            for event in session.exec(
                select(MinderEvent).where(MinderEvent.student_id == student_id).order_by(MinderEvent.created_at.desc()).limit(25)
            ).all()
        ],
        "tutor_events": [
            event.model_dump(mode="json")
            for event in session.exec(
                select(TutorEvent).where(TutorEvent.student_id == student_id).order_by(TutorEvent.created_at.desc()).limit(25)
            ).all()
        ],
    }


@app.get("/dashboard/state")
def dashboard_state(session: Session = Depends(get_session)) -> dict:
    students = session.exec(select(Student).order_by(Student.id)).all()
    payload = {
        "generated_at": now_utc().isoformat(),
        "students": [student_payload(session, student, include_events=False) for student in students],
        "summary": build_summary(students),
        "safety_note": "Demo uses artificial student data for teacher-facing support only.",
    }
    session.add(DashboardSnapshot(snapshot_json=payload))
    session.commit()
    return payload


@app.post("/simulator/tick")
def simulator_tick(request: TickRequest | None = None, session: Session = Depends(get_session)) -> dict:
    try:
        request = request or TickRequest()
        student = tick_next_student(session, request.student_id, request.scripted_event)
        logger.info("Simulator tick updated %s to %s", student.id, student.current_status)
        return student_payload(session, student, include_events=True)
    except ValueError as exc:
        logger.exception("Simulator tick failed.")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/simulator/status")
def simulator_status() -> dict:
    return simulator.status()


@app.post("/simulator/start")
def simulator_start() -> dict:
    return simulator.start()


@app.post("/simulator/keepalive")
def simulator_keepalive() -> dict:
    return simulator.keepalive()


@app.post("/simulator/stop")
def simulator_stop() -> dict:
    return simulator.stop()


@app.post("/simulator/reset")
def simulator_reset(session: Session = Depends(get_session)) -> dict:
    logger.info("Resetting demo data.")
    reset_demo_data(session)
    return dashboard_state(session)


def build_summary(students: list[Student]) -> dict:
    counts: dict[str, int] = {}
    alerts: dict[str, int] = {}
    for student in students:
        counts[student.current_status] = counts.get(student.current_status, 0) + 1
        alerts[student.alert_level] = alerts.get(student.alert_level, 0) + 1
    return {
        "status_counts": counts,
        "alert_counts": alerts,
        "student_count": len(students),
        "urgent_count": sum(1 for student in students if student.alert_level in ("high", "urgent")),
    }


def student_payload(session: Session, student: Student, *, include_events: bool) -> dict:
    assignment_states = session.exec(
        select(StudentAssignmentState).where(StudentAssignmentState.student_id == student.id)
    ).all()
    assignments = {assignment.id: assignment for assignment in session.exec(select(Assignment)).all()}
    payload = student.model_dump(mode="json")
    payload["assignments"] = [
        {
            **state.model_dump(mode="json"),
            "title": assignments[state.assignment_id].title if state.assignment_id in assignments else state.assignment_id,
            "simulated_course": assignments[state.assignment_id].simulated_course if state.assignment_id in assignments else "Demo Course",
        }
        for state in assignment_states
    ]
    if include_events:
        payload.update(get_student_events(student.id, session))
    return payload
