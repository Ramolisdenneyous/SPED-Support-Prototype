import random
from sqlmodel import Session, select

from .models import MinderEvent, Student, StudentAssignmentState, TutorEvent, now_utc


STATUS_LABELS = {
    "working": "Working",
    "confused": "Confused",
    "idle": "Idle",
    "researching": "Researching",
    "off_task": "Off Task",
    "playing_games": "Playing Games",
    "talking_with_friends": "Talking With Friends",
    "using_accommodation": "Using Accommodation",
    "needs_help": "Needs Help",
    "escalation": "Escalation Recommended",
}

SCRIPTED_EVENTS = {
    "confused": ("demo_03", 13),
    "off_task": ("demo_09", 3),
    "playing_games": ("demo_09", 4),
    "talking_with_friends": ("demo_08", 17),
    "accommodation": ("demo_01", 13),
    "needs_help": ("demo_03", 15),
    "escalation": ("demo_08", 18),
}


def roll_3d6() -> int:
    return sum(random.randint(1, 6) for _ in range(3))


def evaluate_status(student: Student, roll: int) -> tuple[str, str, str, str, int]:
    focus_pressure = student.focus_score - 10
    confusion_pressure = student.confusion_score - 10
    off_task_pressure = student.off_task_score - 10

    # Keep the center of the 3d6 bell curve productive. Edge rolls and
    # student-specific pressure still create demo-worthy exceptions.
    if roll == 18:
        return (
            "escalation",
            "urgent",
            "Escalation is recommended after a rare high-risk simulated signal.",
            "Pause and check in directly with the student.",
            0,
        )
    if roll == 17 and student.off_task_score >= 9:
        return (
            "talking_with_friends",
            "low",
            "Student appears to be talking with nearby peers instead of moving the assignment forward.",
            "Use proximity or a quiet prompt to bring attention back to the task.",
            0,
        )
    if roll == 4 and student.off_task_score >= 10:
        return (
            "playing_games",
            "medium",
            "Student appears to be playing a game or using an unrelated app.",
            "Redirect privately and confirm the student is back in the assigned activity.",
            0,
        )
    if roll >= 16 and roll + confusion_pressure >= 20:
        return (
            "needs_help",
            "high",
            "Student appears stuck and may need teacher support.",
            "Offer a quick check-in and task chunking.",
            1,
        )
    if roll <= 5 and roll + off_task_pressure <= 5:
        return (
            "off_task",
            "medium",
            "Student appears to have drifted away from the assigned task.",
            "Redirect privately and confirm the next assignment step.",
            0,
        )
    if roll >= 14 and roll + confusion_pressure >= 18:
        return (
            "confused",
            "medium",
            "Confusion is trending upward while progress is slowing.",
            "Offer a hint or model the first step.",
            1,
        )
    if student.accommodation_flags and roll in (6, 15):
        return (
            "using_accommodation",
            "low",
            "Student is using an approved accommodation support.",
            "Allow support to continue and monitor progress.",
            4,
        )
    if roll in (9, 12):
        return (
            "researching",
            "low",
            "Student is looking up information related to the assignment.",
            "Monitor for productive research.",
            3,
        )
    if 7 <= roll <= 16 or roll + focus_pressure >= 12:
        return (
            "working",
            "none",
            "Student is actively progressing on assigned work.",
            "No immediate action needed.",
            5,
        )
    return (
        "idle",
        "low",
        "Student has not shown recent assignment movement.",
        "Check whether the next step is clear.",
        0,
    )


def tick_student(session: Session, student: Student, scripted_roll: int | None = None) -> Student:
    roll = scripted_roll or roll_3d6()
    status, alert_level, summary, action, progress_delta = evaluate_status(student, roll)
    previous_status = student.current_status

    student.current_status = status
    student.alert_level = alert_level
    student.minder_summary = summary
    student.recommended_action = action
    student.focus_score = max(3, min(18, student.focus_score + (1 if status == "working" else random.choice([-1, 0, 0, 1]))))
    student.confusion_score = max(3, min(18, student.confusion_score + (1 if status in ("confused", "needs_help", "escalation") else random.choice([-1, -1, 0, 0]))))
    student.off_task_score = max(3, min(18, student.off_task_score + (1 if status in ("off_task", "playing_games", "talking_with_friends") else random.choice([-1, -1, 0, 0]))))
    student.progress_score = max(0, min(100, student.progress_score + progress_delta))
    student.engagement_level = max(5, min(100, student.focus_score * 5 - student.off_task_score * 2 - student.confusion_score + 35))
    student.updated_at = now_utc()

    assignment_states = session.exec(
        select(StudentAssignmentState).where(StudentAssignmentState.student_id == student.id)
    ).all()
    if assignment_states:
        primary = assignment_states[0]
        primary.progress_percent = max(0, min(100, primary.progress_percent + progress_delta))
        primary.status = "complete" if primary.progress_percent >= 100 else "in_progress"
        primary.last_activity_at = now_utc()
        primary.updated_at = now_utc()

    message = f"{STATUS_LABELS[status]}: {summary}"
    session.add(MinderEvent(
        student_id=student.id,
        event_type="status_update" if previous_status != status else "heartbeat",
        severity=alert_level if alert_level != "none" else "low",
        message=message,
        raw_data_json={"roll_3d6": roll, "previous_status": previous_status, "status": status},
    ))

    if status == "using_accommodation":
        session.add(TutorEvent(
            student_id=student.id,
            event_type="accommodation_support",
            severity="low",
            message="Tutor placeholder: provided approved task support without giving the answer.",
            raw_data_json={"roll_3d6": roll, "flags": student.accommodation_flags},
        ))
        student.tutor_summary = "Tutor placeholder reports accommodation support was used productively."
    elif status in ("needs_help", "escalation"):
        session.add(TutorEvent(
            student_id=student.id,
            event_type="teacher_escalation",
            severity=alert_level,
            message="Tutor placeholder: escalated to teacher instead of continuing independently.",
            raw_data_json={"roll_3d6": roll},
        ))
        student.tutor_summary = "Tutor placeholder recommends teacher-supervised follow-up."

    session.add(student)
    session.commit()
    session.refresh(student)
    return student


def tick_next_student(session: Session, student_id: str | None = None, scripted_event: str | None = None) -> Student:
    scripted_roll = None
    if scripted_event and scripted_event in SCRIPTED_EVENTS:
        student_id, scripted_roll = SCRIPTED_EVENTS[scripted_event]

    if student_id:
        student = session.get(Student, student_id)
        if not student:
            raise ValueError(f"Student not found: {student_id}")
        return tick_student(session, student, scripted_roll)

    students = session.exec(select(Student).order_by(Student.updated_at, Student.id)).all()
    if not students:
        raise ValueError("No students are seeded.")
    return tick_student(session, students[0])
