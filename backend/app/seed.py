from datetime import timedelta

from sqlmodel import Session, delete, select

from .models import (
    Assignment,
    DashboardSnapshot,
    MinderEvent,
    Student,
    StudentAssignmentState,
    TutorEvent,
    now_utc,
)


PROFILES = [
    ("demo_01", "Avery", "steady_worker", 13, 7, 9, 5, {"task_chunking": True}),
    ("demo_02", "Blake", "high_achiever_low_help", 15, 6, 5, 4, {"text_to_speech": True}),
    ("demo_03", "Casey", "confused_persistent", 12, 12, 11, 5, {"task_chunking": True}),
    ("demo_04", "Devon", "frequent_task_switcher", 10, 8, 9, 11, {"text_to_speech": True}),
    ("demo_05", "Emery", "strong_reader_poor_completion", 11, 7, 7, 8, {}),
    ("demo_06", "Finley", "dyslexia_support", 10, 10, 10, 6, {"text_to_speech": True, "task_chunking": True}),
    ("demo_07", "Gray", "executive_function_support", 9, 9, 9, 7, {}),
    ("demo_08", "Harper", "anxiety_frustration_spike", 11, 11, 6, 5, {"task_chunking": True, "text_to_speech": True}),
    ("demo_09", "Indigo", "off_task_gaming_tendency", 9, 6, 8, 13, {}),
    ("demo_10", "Jordan", "quietly_stalled", 8, 10, 4, 5, {"task_chunking": True, "text_to_speech": True}),
]

ASSIGNMENTS = [
    ("whale_rider_homework", "Whale Rider Homework", "Take movie watch notes for Whale Rider session one.", "Resource English"),
    ("math_homework_1", "Math Homework 1", "Solve order of operations problems using PEMDAS.", "Applied Math"),
    ("chemistry_homework_1", "Chemistry Homework 1", "Balance the chemical equations on the worksheet.", "Chemistry"),
]


def reset_demo_data(session: Session) -> None:
    for model in [DashboardSnapshot, TutorEvent, MinderEvent, StudentAssignmentState, Assignment, Student]:
        session.exec(delete(model))

    due_base = now_utc() + timedelta(days=2)
    for index, (assignment_id, title, description, course) in enumerate(ASSIGNMENTS):
        session.add(Assignment(
            id=assignment_id,
            title=title,
            description=description,
            due_at=due_base + timedelta(days=index),
            simulated_course=course,
        ))

    for index, (student_id, name, profile_type, focus, confusion, help_seeking, off_task, flags) in enumerate(PROFILES):
        student = Student(
            id=student_id,
            display_name=name,
            profile_type=profile_type,
            focus_score=focus,
            confusion_score=confusion,
            progress_score=24 + index * 5,
            off_task_score=off_task,
            engagement_level=72,
            accommodation_flags=flags,
            minder_summary="Student is in the initial demo state.",
            recommended_action="No action needed yet. Continue monitoring.",
        )
        session.add(student)
        for assignment_index, (assignment_id, *_rest) in enumerate(ASSIGNMENTS):
            progress = max(0, min(100, student.progress_score - assignment_index * 12))
            session.add(StudentAssignmentState(
                student_id=student_id,
                assignment_id=assignment_id,
                progress_percent=progress,
                status="in_progress" if progress else "not_started",
            ))
        session.flush()
        session.add(MinderEvent(
            student_id=student_id,
            event_type="demo_seeded",
            severity="low",
            message=f"{name} loaded into the simulated classroom.",
            raw_data_json={"profile_type": profile_type},
        ))
        if flags:
            session.add(TutorEvent(
                student_id=student_id,
                event_type="accommodation_available",
                severity="low",
                message=f"Accommodation supports available: {', '.join(flags.keys()).replace('_', ' ')}.",
                raw_data_json={"flags": flags},
            ))

    session.commit()


def ensure_seed_data(session: Session) -> None:
    existing = session.exec(select(Student).limit(1)).first()
    if existing:
        return
    reset_demo_data(session)
