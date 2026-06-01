# SPED Support Swarm Prototype

Teacher-facing demonstration prototype for a simulated SPED classroom support dashboard. It uses only artificial demo data.

## Run Locally

```powershell
docker compose up --build
```

Open:

```text
http://localhost:5173
```

Backend health:

```text
http://localhost:8000/health
```

## Services

- `frontend`: React, TypeScript, PixiJS dashboard.
- `backend`: FastAPI source of truth for students, assignments, events, and dashboard state.
- `simulator`: optional rule-based fake student heartbeat service. It is off by default; use the dashboard Start Simulator button for normal demos.
- `postgres`: demo database.

The dashboard keeps the simulator alive only while a browser session is active. As a hosting safety rail, the backend also stops any continuous simulator run after `SIM_MAX_RUNTIME_SECONDS` seconds, defaulting to one hour.

The standalone simulator container is behind a Docker Compose profile and is only for manual testing:

```powershell
docker compose --profile manual-simulator up simulator
```

## Safety Messaging

This prototype demonstrates teacher-facing support, guided intervention, accommodation visibility, and early warning indicators. It does not use real student data, grade students, automate discipline, make IEP decisions, or replace teachers.
