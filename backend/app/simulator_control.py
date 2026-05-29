import logging
import os
import threading
from datetime import datetime, timedelta

from sqlmodel import Session

from .database import engine
from .logic import tick_next_student
from .models import now_utc


logger = logging.getLogger("sped-support-backend.simulator")


class SimulatorController:
    def __init__(self) -> None:
        heartbeat_seconds = max(5, int(os.getenv("SIM_HEARTBEAT_SECONDS", "50")))
        student_count = max(1, int(os.getenv("SIM_STUDENT_COUNT", "10")))
        self.tick_gap_seconds = max(1.0, heartbeat_seconds / student_count)
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self.last_tick_at: datetime | None = None
        self.last_error: str | None = None
        self.lease_expires_at: datetime | None = None

    def start(self) -> dict:
        with self._lock:
            self._refresh_lease_locked()
            if self._thread and self._thread.is_alive():
                return self.status()
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._run, name="demo-simulator", daemon=True)
            self._thread.start()
            logger.info("Simulator started with tick_gap_seconds=%.1f", self.tick_gap_seconds)
            return self.status()

    def keepalive(self) -> dict:
        with self._lock:
            self._refresh_lease_locked()
            return self.status()

    def stop(self) -> dict:
        with self._lock:
            self._stop_event.set()
            self.lease_expires_at = None
            thread = self._thread
        if thread and thread.is_alive():
            thread.join(timeout=2)
        with self._lock:
            if self._thread is thread:
                self._thread = None
            logger.info("Simulator stopped.")
            return self.status()

    def status(self) -> dict:
        running = bool(self._thread and self._thread.is_alive())
        return {
            "running": running,
            "tick_gap_seconds": self.tick_gap_seconds,
            "last_tick_at": self.last_tick_at.isoformat() if self.last_tick_at else None,
            "last_error": self.last_error,
            "lease_expires_at": self.lease_expires_at.isoformat() if self.lease_expires_at else None,
        }

    def _run(self) -> None:
        while not self._stop_event.is_set():
            with self._lock:
                lease_expires_at = self.lease_expires_at
            if lease_expires_at and now_utc() > lease_expires_at:
                logger.info("Simulator lease expired; stopping background ticks.")
                with self._lock:
                    self.lease_expires_at = None
                    self._thread = None
                    self._stop_event.set()
                break
            try:
                with Session(engine) as session:
                    student = tick_next_student(session)
                    self.last_tick_at = now_utc()
                    self.last_error = None
                    logger.info("Simulator tick updated %s to %s", student.id, student.current_status)
            except Exception as exc:
                self.last_error = str(exc)
                logger.exception("Simulator background tick failed.")
            self._stop_event.wait(self.tick_gap_seconds)

    def _refresh_lease_locked(self) -> None:
        self.lease_expires_at = now_utc() + timedelta(seconds=max(15.0, self.tick_gap_seconds * 3))
