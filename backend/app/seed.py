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
    ("demo_01", "Avery", "steady_worker", 13, 7, 9, 5, {"executive_function_support": True}),
    ("demo_02", "Blake", "high_achiever_low_help", 15, 6, 5, 4, {}),
    ("demo_03", "Casey", "confused_persistent", 12, 12, 11, 5, {"task_chunking": True}),
    ("demo_04", "Devon", "frequent_task_switcher", 10, 8, 9, 11, {"executive_function_support": True}),
    ("demo_05", "Emery", "strong_reader_poor_completion", 11, 7, 7, 8, {}),
    ("demo_06", "Finley", "dyslexia_support", 10, 10, 10, 6, {"reading_support": True, "text_to_speech": True}),
    ("demo_07", "Gray", "executive_function_support", 9, 9, 9, 7, {"checklist_support": True}),
    ("demo_08", "Harper", "anxiety_frustration_spike", 11, 11, 6, 5, {"calm_prompting": True}),
    ("demo_09", "Indigo", "off_task_gaming_tendency", 9, 6, 8, 13, {}),
    ("demo_10", "Jordan", "quietly_stalled", 8, 10, 4, 5, {"teacher_check_in": True}),
]

ASSIGNMENTS = [
    ("ela_context_clues", "ELA: Context Clues Practice", "Read the passage and identify meaning from context.", "Resource English"),
    ("math_fraction_models", "Math: Fraction Model Exit Ticket", "Complete visual fraction comparison problems.", "Applied Math"),
    ("science_vocab", "Science: Ecosystem Vocabulary", "Match key terms and write one example for each.", "Life Science"),
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
