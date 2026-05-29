import logging
import os
import time

import httpx


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s simulator %(message)s")
logger = logging.getLogger("simulator")

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
HEARTBEAT_SECONDS = max(5, int(os.getenv("SIM_HEARTBEAT_SECONDS", "50")))
STUDENT_COUNT = 10


def wait_for_backend(client: httpx.Client) -> None:
    while True:
        try:
            response = client.get(f"{BACKEND_URL}/health", timeout=5)
            response.raise_for_status()
            logger.info("Backend is ready at %s", BACKEND_URL)
            return
        except Exception as exc:
            logger.info("Waiting for backend: %s", exc)
            time.sleep(2)


def main() -> None:
    tick_gap = max(1, HEARTBEAT_SECONDS / STUDENT_COUNT)
    logger.info("Starting simulator heartbeat. heartbeat_seconds=%s tick_gap=%.1f", HEARTBEAT_SECONDS, tick_gap)
    with httpx.Client() as client:
        wait_for_backend(client)
        while True:
            try:
                response = client.post(f"{BACKEND_URL}/simulator/tick", json={}, timeout=10)
                response.raise_for_status()
                data = response.json()
                logger.info("Ticked %s -> %s / %s", data.get("display_name"), data.get("current_status"), data.get("alert_level"))
            except Exception:
                logger.exception("Simulator tick failed.")
            time.sleep(tick_gap)


if __name__ == "__main__":
    main()
