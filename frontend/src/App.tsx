import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Application,
  Assets,
  Container,
  FederatedPointerEvent,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from 'pixi.js'
import { AlertTriangle, CheckCircle2, ChevronDown, ClipboardList, HelpCircle, LayoutGrid, Play, RefreshCw, RotateCcw, School, ShieldCheck, X } from 'lucide-react'
import chunkedChemistryHomework from './assets/accommodations/chemistry-homework-1-chunked.txt?raw'
import chunkedMathHomework from './assets/accommodations/math-homework-1-chunked.txt?raw'
import chunkedWhaleRiderHomework from './assets/accommodations/whale-rider-homework-chunked.txt?raw'
import './App.css'

type StudentStatus =
  | 'working'
  | 'confused'
  | 'idle'
  | 'researching'
  | 'off_task'
  | 'playing_games'
  | 'talking_with_friends'
  | 'using_accommodation'
  | 'needs_help'
  | 'escalation'

type AlertLevel = 'none' | 'low' | 'medium' | 'high' | 'urgent'

type AssignmentState = {
  assignment_id: string
  title: string
  simulated_course: string
  description?: string
  asset_url?: string | null
  progress_percent: number
  status: string
}

type EventItem = {
  id: number
  event_type: string
  severity: AlertLevel
  message: string
  created_at: string
}

type Student = {
  id: string
  display_name: string
  profile_type: string
  current_status: StudentStatus
  alert_level: AlertLevel
  focus_score: number
  confusion_score: number
  progress_score: number
  off_task_score: number
  engagement_level: number
  accommodation_flags: Record<string, boolean>
  minder_summary: string
  tutor_summary: string
  recommended_action: string
  assignments: AssignmentState[]
  minder_events?: EventItem[]
  tutor_events?: EventItem[]
}

type DashboardState = {
  generated_at: string
  students: Student[]
  summary: {
    status_counts: Record<string, number>
    alert_counts: Record<string, number>
    student_count: number
    urgent_count: number
  }
  safety_note: string
}

type SimulatorStatus = {
  running: boolean
  tick_gap_seconds: number
  last_tick_at: string | null
  last_error: string | null
  lease_expires_at: string | null
}

type ViewMode = 'classroom' | 'cards'
type TtsClip = {
  label: string
  url: string
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const sceneWidth = 1536
const sceneHeight = 1024
const movementDurationMs = 4000
const statusLabels: Record<StudentStatus, string> = {
  working: 'Working',
  confused: 'Confused',
  idle: 'Idle',
  researching: 'Researching',
  off_task: 'Off Task',
  playing_games: 'Playing Games',
  talking_with_friends: 'Talking With Friends',
  using_accommodation: 'Using Accommodation',
  needs_help: 'Needs Help',
  escalation: 'Escalation Recommended',
}
const statusColors: Record<StudentStatus, number> = {
  working: 0xf6c949,
  confused: 0xf4a261,
  idle: 0x9aa6b2,
  researching: 0x45b7d1,
  off_task: 0xee6c4d,
  playing_games: 0x2f80ed,
  talking_with_friends: 0xd95d9b,
  using_accommodation: 0x62c370,
  needs_help: 0xff595e,
  escalation: 0xb00020,
}
const cachedSupportResults: Record<string, Record<string, { title: string; content: string }>> = {
  whale_rider_homework: {
    task_chunking: {
      title: 'Chunked Whale Rider Homework',
      content: chunkedWhaleRiderHomework,
    },
  },
  math_homework_1: {
    task_chunking: {
      title: 'Chunked Math Homework 1',
      content: chunkedMathHomework,
    },
  },
  chemistry_homework_1: {
    task_chunking: {
      title: 'Chunked Chemistry Homework 1',
      content: chunkedChemistryHomework,
    },
  },
}
const cachedTtsResults: Record<string, { title: string; clips: TtsClip[] }> = {
  whale_rider_homework: {
    title: 'Whale Rider Homework Audio Pack',
    clips: [
      { label: 'Timeline', url: '/assets/tts/whale-rider-homework/timeline.mp3' },
      { label: 'Cultural Elements', url: '/assets/tts/whale-rider-homework/cultural-elements.mp3' },
      { label: 'Setting', url: '/assets/tts/whale-rider-homework/setting.mp3' },
      { label: 'Conflict', url: '/assets/tts/whale-rider-homework/conflict.mp3' },
      { label: 'Concrete Detail #1', url: '/assets/tts/whale-rider-homework/concrete-detail-1.mp3' },
      { label: 'Analysis and Unpacking', url: '/assets/tts/whale-rider-homework/analysis-unpacking.mp3' },
      { label: 'Additional Details and Analysis', url: '/assets/tts/whale-rider-homework/additional-details.mp3' },
    ],
  },
  math_homework_1: {
    title: 'Math Homework 1 Audio Pack',
    clips: Array.from({ length: 8 }, (_value, index) => ({
      label: `Problem ${index + 1}`,
      url: `/assets/tts/math-homework-1/problem-${index + 1}.mp3`,
    })),
  },
  chemistry_homework_1: {
    title: 'Chemistry Homework 1 Audio Pack',
    clips: Array.from({ length: 10 }, (_value, index) => ({
      label: `Problem ${index + 1}`,
      url: `/assets/tts/chemistry-homework-1/problem-${index + 1}.mp3`,
    })),
  },
}

type ClassroomPoint = readonly [number, number]

type ClassroomLocation = {
  label: string
  slots: readonly ClassroomPoint[]
}

type MotionState = {
  x: number
  y: number
  targetX: number
  targetY: number
  startX: number
  startY: number
  startedAt: number
  moving: boolean
  queuedTarget?: ClassroomPoint
}

type AgentTextures = {
  standing: Texture
  walkLeft: Texture[]
  walkRight: Texture[]
  working: Texture[]
  researching: Texture[]
  offTask: Texture[]
}

const agentDisplayHeight = 122
const offTaskDisplayWidth = 102
const agentFrameRate = 8
const workingFrameRate = 6
const researchingFrameRate = 6
const offTaskFrameRate = 1.75
const agentAssetPaths = {
  standing: '/assets/student-agent/standing.png',
  walkLeft: [
    '/assets/student-agent/walk-left-1.png',
    '/assets/student-agent/walk-left-2.png',
    '/assets/student-agent/walk-left-3.png',
    '/assets/student-agent/walk-left-4.png',
  ],
  walkRight: [
    '/assets/student-agent/walk-right-1.png',
    '/assets/student-agent/walk-right-2.png',
    '/assets/student-agent/walk-right-3.png',
    '/assets/student-agent/walk-right-4.png',
  ],
  working: [
    '/assets/student-agent/working/work-1.png',
    '/assets/student-agent/working/work-2.png',
    '/assets/student-agent/working/work-3.png',
    '/assets/student-agent/working/work-4.png',
    '/assets/student-agent/working/work-5.png',
  ],
  researching: [
    '/assets/student-agent/researching/research-1.png',
    '/assets/student-agent/researching/research-2.png',
    '/assets/student-agent/researching/research-3.png',
    '/assets/student-agent/researching/research-4.png',
    '/assets/student-agent/researching/research-5.png',
    '/assets/student-agent/researching/research-6.png',
  ],
  offTask: Array.from({ length: 14 }, (_value, index) => `/assets/student-agent/off-task/off-task-${index + 1}.png`),
}

const homeDeskSlots: Record<string, ClassroomPoint> = {
  demo_01: [278, 516],
  demo_02: [512, 526],
  demo_03: [742, 562],
  demo_04: [1014, 582],
  demo_05: [130, 580],
  demo_06: [386, 624],
  demo_07: [636, 662],
  demo_08: [922, 680],
  demo_09: [506, 772],
  demo_10: [820, 820],
}

const classroomLocations: Record<string, ClassroomLocation> = {
  homeDesk: {
    label: 'Assigned desks',
    slots: Object.values(homeDeskSlots),
  },
  researching: {
    label: 'Reading and research area',
    slots: [[392, 430], [430, 390], [472, 455]],
  },
  talkingWithFriends: {
    label: 'Talking with friends',
    slots: [[150, 438], [210, 412], [270, 442]],
  },
  playingGames: {
    label: 'Playing games',
    slots: [[1118, 504], [1172, 472], [1068, 474]],
  },
  teacherSupport: {
    label: 'Teacher support desk',
    slots: [[696, 384], [780, 400], [862, 420]],
  },
  offTask: {
    label: 'Off-task zones',
    slots: [[950, 374], [668, 338], [1078, 382], [1138, 360]],
  },
  accommodation: {
    label: 'Accommodation support area',
    slots: [[1380, 812], [1430, 812], [1332, 844], [1478, 844]],
  },
}

const statusZonePriority: Record<StudentStatus, string> = {
  working: 'homeDesk',
  confused: 'teacherSupport',
  idle: 'homeDesk',
  researching: 'researching',
  off_task: 'offTask',
  playing_games: 'playingGames',
  talking_with_friends: 'talkingWithFriends',
  using_accommodation: 'accommodation',
  needs_help: 'teacherSupport',
  escalation: 'teacherSupport',
}

function App() {
  const [dashboard, setDashboard] = useState<DashboardState | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Student | null>(null)
  const [loadingAction, setLoadingAction] = useState('')
  const [error, setError] = useState('')
  const [simulatorStatus, setSimulatorStatus] = useState<SimulatorStatus | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('classroom')
  const simulatorRunningRef = useRef(false)

  const refreshDashboard = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/dashboard/state`)
      if (!response.ok) throw new Error(`Dashboard request failed: ${response.status}`)
      const data = await response.json() as DashboardState
      setDashboard(data)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard.')
    }
  }, [])

  const refreshSimulatorStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/simulator/status`)
      if (!response.ok) throw new Error(`Simulator status failed: ${response.status}`)
      const data = await response.json() as SimulatorStatus
      setSimulatorStatus(data)
      simulatorRunningRef.current = data.running
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load simulator status.')
    }
  }, [])

  const loadStudent = useCallback(async (studentId: string) => {
    setSelectedId(studentId)
    try {
      const response = await fetch(`${API_URL}/students/${studentId}`)
      if (!response.ok) throw new Error(`Student request failed: ${response.status}`)
      setSelected(await response.json() as Student)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load student details.')
    }
  }, [])

  const runAction = useCallback(async (label: string, url: string, body?: unknown) => {
    setLoadingAction(label)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!response.ok) throw new Error(`${label} failed: ${response.status}`)
      const result = await response.json()
      if (result && typeof result === 'object' && 'id' in result && typeof result.id === 'string') {
        setSelectedId(result.id)
        setSelected(result as Student)
      } else if (label === 'Reset') {
        setSelectedId(null)
        setSelected(null)
      }
      await refreshDashboard()
      await refreshSimulatorStatus()
      if (result && typeof result === 'object' && 'id' in result && typeof result.id === 'string') {
        await loadStudent(result.id)
      } else if (selectedId) {
        await loadStudent(selectedId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label} failed.`)
    } finally {
      setLoadingAction('')
    }
  }, [loadStudent, refreshDashboard, refreshSimulatorStatus, selectedId])

  const toggleSimulator = useCallback(async () => {
    const isRunning = simulatorStatus?.running ?? false
    await runAction(isRunning ? 'Stop simulator' : 'Start simulator', `${API_URL}/simulator/${isRunning ? 'stop' : 'start'}`)
  }, [runAction, simulatorStatus?.running])

  const clearSelection = useCallback(() => {
    setSelectedId(null)
    setSelected(null)
  }, [])

  useEffect(() => {
    const startupTimer = window.setTimeout(() => {
      refreshDashboard()
      refreshSimulatorStatus()
    }, 0)
    const interval = window.setInterval(refreshDashboard, 3000)
    const statusInterval = window.setInterval(refreshSimulatorStatus, 5000)
    return () => {
      window.clearTimeout(startupTimer)
      window.clearInterval(interval)
      window.clearInterval(statusInterval)
    }
  }, [refreshDashboard, refreshSimulatorStatus])

  useEffect(() => {
    const stopSimulatorOnClose = () => {
      if (!simulatorRunningRef.current) return
      const url = `${API_URL}/simulator/stop`
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([], { type: 'application/json' }))
      } else {
        fetch(url, { method: 'POST', keepalive: true }).catch(() => undefined)
      }
      simulatorRunningRef.current = false
    }
    window.addEventListener('pagehide', stopSimulatorOnClose)
    return () => window.removeEventListener('pagehide', stopSimulatorOnClose)
  }, [])

  useEffect(() => {
    if (!simulatorStatus?.running) return undefined
    const keepalive = async () => {
      try {
        const response = await fetch(`${API_URL}/simulator/keepalive`, { method: 'POST' })
        if (response.ok) {
          const data = await response.json() as SimulatorStatus
          setSimulatorStatus(data)
          simulatorRunningRef.current = data.running
        }
      } catch {
        simulatorRunningRef.current = false
      }
    }
    const interval = window.setInterval(keepalive, 5000)
    return () => window.clearInterval(interval)
  }, [simulatorStatus?.running])

  useEffect(() => {
    if (!selected && selectedId) {
      const timer = window.setTimeout(() => loadStudent(selectedId), 0)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [loadStudent, selected, selectedId])

  return (
    <main className="app-shell">
      <section className="map-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Teacher-facing support prototype</p>
            <h1>SPED Support Swarm</h1>
          </div>
          <div className="view-tabs" role="tablist" aria-label="View style">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'classroom'}
              className={viewMode === 'classroom' ? 'active-tab' : ''}
              onClick={() => setViewMode('classroom')}
            >
              <School size={16} />
              Classroom
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'cards'}
              className={viewMode === 'cards' ? 'active-tab' : ''}
              onClick={() => {
                setViewMode('cards')
                clearSelection()
              }}
            >
              <LayoutGrid size={16} />
              Cards
            </button>
          </div>
          <div className="topbar-actions">
            <div className="summary-strip">
              <SummaryPill icon={<CheckCircle2 />} label="Students" value={dashboard?.summary.student_count ?? 10} />
              <SummaryPill icon={<HelpCircle />} label="Needs Attention" value={dashboard?.summary.urgent_count ?? 0} tone="warn" />
              <SummaryPill icon={<ShieldCheck />} label="Demo Data" value="Only" tone="safe" />
            </div>
            <div className="sim-control-group">
              <button
                type="button"
                className={`simulator-toggle ${simulatorStatus?.running ? 'stop-control running' : 'start-control'}`}
                onClick={toggleSimulator}
                disabled={!!loadingAction}
                title={simulatorStatus?.running ? `Running every ${simulatorStatus.tick_gap_seconds}s` : 'Simulator is off'}
              >
                {simulatorStatus?.running ? <RefreshCw size={16} /> : <Play size={16} />}
                {simulatorStatus?.running ? 'Stop Simulator' : 'Start Simulator'}
              </button>
            </div>
          </div>
        </header>

        <div className="status-rail">
          {Object.entries(dashboard?.summary.status_counts ?? {}).map(([status, count]) => (
            <span key={status} style={{ '--status': toHex(statusColors[status as StudentStatus] ?? 0x9aa6b2) } as React.CSSProperties}>
              {statusLabels[status as StudentStatus] ?? status}: {count}
            </span>
          ))}
        </div>

        {error && <div className="error-banner">{error}</div>}

        {viewMode === 'classroom'
          ? <ClassroomMap students={dashboard?.students ?? []} selectedId={selectedId} onSelect={loadStudent} />
          : <StudentCardsView students={dashboard?.students ?? []} onSelect={(studentId) => {
              setViewMode('classroom')
              loadStudent(studentId)
            }} />}

        {viewMode === 'classroom' && selected && <StudentBubble key={selected.id} student={selected} onClose={clearSelection} />}

        <footer className="demo-controls">
          <button type="button" onClick={() => runAction('Tick', `${API_URL}/simulator/tick`, {})} disabled={!!loadingAction}>
            <RefreshCw size={16} /> Tick
          </button>
          {['confused', 'off_task', 'playing_games', 'talking_with_friends', 'accommodation', 'needs_help', 'escalation'].map((event) => (
            <button key={event} type="button" onClick={() => runAction(event, `${API_URL}/simulator/tick`, { scripted_event: event })} disabled={!!loadingAction}>
              {event.replaceAll('_', ' ')}
            </button>
          ))}
          <button type="button" onClick={() => runAction('Reset', `${API_URL}/simulator/reset`)} disabled={!!loadingAction}>
            <RotateCcw size={16} /> Reset
          </button>
        </footer>
      </section>

    </main>
  )
}

function SummaryPill({ icon, label, value, tone = 'default' }: { icon: React.ReactNode; label: string; value: string | number; tone?: string }) {
  return (
    <div className={`summary-pill ${tone}`}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ClassroomMap({ students, selectedId, onSelect }: { students: Student[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const appRef = useRef<Application | null>(null)
  const spritesRef = useRef<Map<string, Container>>(new Map())
  const motionRef = useRef<Map<string, MotionState>>(new Map())
  const assignedSlotsRef = useRef<Map<string, ClassroomPoint>>(new Map())
  const movingStudentRef = useRef<string | null>(null)
  const moveQueueRef = useRef<string[]>([])
  const studentsRef = useRef<Student[]>(students)
  const selectedRef = useRef(selectedId)

  useEffect(() => { studentsRef.current = students }, [students])
  useEffect(() => { selectedRef.current = selectedId }, [selectedId])

  useEffect(() => {
    let destroyed = false
    const spriteMap = spritesRef.current
    const motionMap = motionRef.current
    const assignedSlotsMap = assignedSlotsRef.current
    const setup = async () => {
      if (!hostRef.current || appRef.current) return
      const app = new Application()
      await app.init({ background: '#172234', antialias: true, resizeTo: hostRef.current })
      if (destroyed || !hostRef.current) {
        app.destroy(true)
        return
      }
      appRef.current = app
      hostRef.current.appendChild(app.canvas)
      const classroom = new Container()
      app.stage.addChild(classroom)

      const [bgTexture, standingTexture, walkLeftTextures, walkRightTextures] = await Promise.all([
        Assets.load('/assets/teacher-classroom-background.png'),
        Assets.load(agentAssetPaths.standing),
        Promise.all(agentAssetPaths.walkLeft.map((path) => Assets.load(path))),
        Promise.all(agentAssetPaths.walkRight.map((path) => Assets.load(path))),
      ])
      const agentTextures: AgentTextures = {
        standing: standingTexture,
        walkLeft: walkLeftTextures,
        walkRight: walkRightTextures,
        working: [standingTexture],
        researching: [standingTexture],
        offTask: [standingTexture],
      }
      const background = new Sprite(bgTexture)
      background.width = sceneWidth
      background.height = sceneHeight
      classroom.addChild(background)
      classroom.addChild(new Graphics().rect(0, 0, sceneWidth, sceneHeight).fill({ color: 0x0d1722, alpha: 0.08 }))

      Promise.all([
        Promise.all(agentAssetPaths.working.map((path) => Assets.load(path))),
        Promise.all(agentAssetPaths.researching.map((path) => Assets.load(path))),
        Promise.all(agentAssetPaths.offTask.map((path) => Assets.load(path))),
      ]).then(([workingTextures, researchingTextures, offTaskTextures]) => {
        if (destroyed) return
        agentTextures.working = workingTextures
        agentTextures.researching = researchingTextures
        agentTextures.offTask = offTaskTextures
      }).catch(() => undefined)

      const minderLayer = new Container()
      classroom.addChild(minderLayer)

      app.ticker.add(() => {
        const time = performance.now() / 1000
        const hostWidth = hostRef.current?.clientWidth ?? app.screen.width
        const hostHeight = hostRef.current?.clientHeight ?? app.screen.height
        if (app.screen.width !== hostWidth || app.screen.height !== hostHeight) {
          app.renderer.resize(hostWidth, hostHeight)
        }
        const isPhoneLandscape = hostWidth > hostHeight && hostHeight <= 520
        const scale = isPhoneLandscape
          ? Math.max(hostWidth / sceneWidth, hostHeight / sceneHeight)
          : Math.min(hostWidth / sceneWidth, hostHeight / sceneHeight)
        classroom.scale.set(scale)
        classroom.x = (hostWidth - sceneWidth * scale) / 2
        classroom.y = (hostHeight - sceneHeight * scale) / 2
        const now = performance.now()
        const active = new Set(studentsRef.current.map((student) => student.id))
        const assignedSlots = assignClassroomSlots(studentsRef.current)
        const currentAssignments = assignedSlotsMap

        studentsRef.current.forEach((student, index) => {
          const target = assignedSlots.get(student.id) ?? assignedDeskForStudent(student, index)
          const currentTarget = currentAssignments.get(student.id)
          let sprite = spriteMap.get(student.id)
          let motion = motionMap.get(student.id)

          if (!sprite) {
            sprite = createMinder(student, agentTextures, () => onSelect(student.id))
            const home = assignedDeskForStudent(student, index)
            sprite.x = home[0]
            sprite.y = home[1]
            spriteMap.set(student.id, sprite)
            minderLayer.addChild(sprite)
          }

          if (!motion) {
            motion = createMotionState(assignedDeskForStudent(student, index))
            motionMap.set(student.id, motion)
          }

          if (!currentTarget || currentTarget[0] !== target[0] || currentTarget[1] !== target[1]) {
            currentAssignments.set(student.id, target)
            motion.queuedTarget = target
            if (!motion.moving && !moveQueueRef.current.includes(student.id) && movingStudentRef.current !== student.id) {
              moveQueueRef.current.push(student.id)
            }
          }

          if (!movingStudentRef.current) {
            startNextQueuedMove(moveQueueRef.current, motionMap, movingStudentRef, now)
          }

          if (motion.moving) {
            const progress = Math.min(1, (now - motion.startedAt) / movementDurationMs)
            const eased = easeInOutCubic(progress)
            motion.x = motion.startX + (motion.targetX - motion.startX) * eased
            motion.y = motion.startY + (motion.targetY - motion.startY) * eased
            if (progress >= 1) {
              motion.x = motion.targetX
              motion.y = motion.targetY
              motion.moving = false
              if (movingStudentRef.current === student.id) {
                movingStudentRef.current = null
              }
              if (motion.queuedTarget && !moveQueueRef.current.includes(student.id)) {
                moveQueueRef.current.push(student.id)
              }
            }
          }

          updateMinder(sprite, student, selectedRef.current === student.id, time, motion, agentTextures)
          sprite.x = motion.x
          sprite.y = motion.y + Math.sin(time * 2.5 + index) * 3
        })
        if (!movingStudentRef.current) {
          startNextQueuedMove(moveQueueRef.current, motionMap, movingStudentRef, now)
        }
        for (const [id, sprite] of spriteMap) {
          if (!active.has(id)) {
            sprite.destroy({ children: true })
            spriteMap.delete(id)
            motionMap.delete(id)
            currentAssignments.delete(id)
            moveQueueRef.current = moveQueueRef.current.filter((queuedId) => queuedId !== id)
            if (movingStudentRef.current === id) {
              movingStudentRef.current = null
            }
          }
        }
      })
    }
    setup()
    return () => {
      destroyed = true
      appRef.current?.destroy(true)
      appRef.current = null
      spriteMap.clear()
      motionMap.clear()
      assignedSlotsMap.clear()
      moveQueueRef.current = []
      movingStudentRef.current = null
    }
  }, [onSelect])

  return <div className="classroom-stage" ref={hostRef} />
}

function assignClassroomSlots(students: Student[]) {
  const assignments = new Map<string, ClassroomPoint>()
  const zoneCounts = new Map<string, number>()

  students.forEach((student, index) => {
    const zoneKey = statusZonePriority[student.current_status] ?? 'homeDesk'
    if (zoneKey === 'homeDesk') {
      assignments.set(student.id, assignedDeskForStudent(student, index))
      return
    }

    assignments.set(student.id, nextSharedSlot(zoneKey, zoneCounts))
  })

  return assignments
}

function assignedDeskForStudent(student: Student, index: number): ClassroomPoint {
  const explicitDesk = homeDeskSlots[student.id]
  if (explicitDesk) return explicitDesk

  const numericId = Number(student.id.replace(/\D/g, ''))
  if (Number.isFinite(numericId) && numericId > 0) {
    return classroomLocations.homeDesk.slots[(numericId - 1) % classroomLocations.homeDesk.slots.length]
  }

  return classroomLocations.homeDesk.slots[index % classroomLocations.homeDesk.slots.length]
}

function nextSharedSlot(zoneKey: string, zoneCounts: Map<string, number>): ClassroomPoint {
  const location = classroomLocations[zoneKey] ?? classroomLocations.homeDesk
  const count = zoneCounts.get(zoneKey) ?? 0
  zoneCounts.set(zoneKey, count + 1)

  const base = location.slots[count % location.slots.length]
  if (count < location.slots.length) return base

  const ring = Math.floor(count / location.slots.length)
  const side = count % 4
  const offset = 38 + ring * 18
  const offsets: ClassroomPoint[] = [[offset, 0], [0, offset], [-offset, 0], [0, -offset]]
  return [base[0] + offsets[side][0], base[1] + offsets[side][1]]
}

function createMotionState(target: ClassroomPoint): MotionState {
  return {
    x: target[0],
    y: target[1],
    targetX: target[0],
    targetY: target[1],
    startX: target[0],
    startY: target[1],
    startedAt: performance.now(),
    moving: false,
  }
}

function startNextQueuedMove(
  queue: string[],
  motions: Map<string, MotionState>,
  movingStudentRef: { current: string | null },
  now: number,
) {
  while (!movingStudentRef.current && queue.length) {
    const studentId = queue.shift()
    if (!studentId) return

    const motion = motions.get(studentId)
    const target = motion?.queuedTarget
    if (!motion || !target) continue

    motion.queuedTarget = undefined
    if (Math.abs(motion.x - target[0]) < 1 && Math.abs(motion.y - target[1]) < 1) continue

    motion.startX = motion.x
    motion.startY = motion.y
    motion.targetX = target[0]
    motion.targetY = target[1]
    motion.startedAt = now
    motion.moving = true
    movingStudentRef.current = studentId
  }
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2
}

function createMinder(student: Student, agentTextures: AgentTextures, onTap: () => void) {
  const container = new Container()
  container.eventMode = 'static'
  container.cursor = 'pointer'
  container.on('pointertap', (event: FederatedPointerEvent) => {
    event.stopPropagation()
    onTap()
  })
  container.addChild(new Graphics().ellipse(0, 56, 48, 15).fill({ color: 0x000000, alpha: 0.22 }))
  const ring = new Graphics()
  ring.name = 'statusRing'
  container.addChild(ring)
  const agent = new Sprite(agentTextures.standing)
  agent.anchor.set(0.5, 1)
  sizeAgentSprite(agent, student)
  agent.y = 58
  agent.name = 'agentSprite'
  container.addChild(agent)
  const label = new Text({ text: student.display_name.slice(0, 2), style: new TextStyle({ fill: 0x18212c, fontSize: 19, fontWeight: '700' }) })
  label.anchor.set(0.5)
  label.y = 38
  label.name = 'label'
  container.addChild(label)
  const marker = new Text({ text: '', style: new TextStyle({ fill: 0xffffff, fontSize: 21, fontWeight: '800', stroke: { color: 0x16202b, width: 4 } }) })
  marker.anchor.set(0.5)
  marker.y = -76
  marker.name = 'marker'
  container.addChild(marker)
  return container
}

function updateMinder(container: Container, student: Student, selected: boolean, time: number, motion: MotionState, agentTextures: AgentTextures) {
  const ring = container.getChildByName('statusRing') as Graphics | null
  if (ring) {
    ring
      .clear()
      .circle(0, 1, selected ? 50 : 45)
      .fill({ color: statusColors[student.current_status], alpha: selected ? 0.36 : 0.22 })
      .stroke({ width: selected ? 7 : 4, color: selected ? 0xffffff : statusColors[student.current_status], alpha: selected ? 0.98 : 0.78 })
  }

  const agent = container.getChildByName('agentSprite') as Sprite | null
  if (agent) {
    agent.texture = textureForMotion(motion, time, student, agentTextures)
    sizeAgentSprite(agent, student)
  }

  const marker = container.getChildByName('marker') as Text | null
  if (marker) marker.text = markerFor(student.current_status)
  const pulse = student.alert_level === 'urgent' || student.alert_level === 'high' ? 1 + Math.sin(time * 6) * 0.06 : 1
  container.scale.set(pulse)
}

function textureForMotion(motion: MotionState, time: number, student: Student, agentTextures: AgentTextures) {
  if (!motion.moving) {
    if (student.current_status === 'working') {
      const frame = Math.floor(time * workingFrameRate) % agentTextures.working.length
      return agentTextures.working[frame]
    }
    if (student.current_status === 'researching') {
      const frame = Math.floor(time * researchingFrameRate) % agentTextures.researching.length
      return agentTextures.researching[frame]
    }
    if (student.current_status === 'off_task') {
      const frame = Math.floor(time * offTaskFrameRate) % agentTextures.offTask.length
      return agentTextures.offTask[frame]
    }
    return agentTextures.standing
  }

  const frames = motion.targetX < motion.startX ? agentTextures.walkLeft : agentTextures.walkRight
  const frame = Math.floor(time * agentFrameRate) % frames.length
  return frames[frame]
}

function sizeAgentSprite(agent: Sprite, student: Student) {
  if (student.current_status === 'off_task') {
    agent.width = offTaskDisplayWidth
    agent.height = agent.texture.height * (offTaskDisplayWidth / agent.texture.width)
    return
  }

  agent.height = agentDisplayHeight
  agent.width = agent.texture.width * (agentDisplayHeight / agent.texture.height)
}

function StudentCardsView({ students, onSelect }: { students: Student[]; onSelect: (id: string) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const expandedStudent = students.find((student) => student.id === expandedId) ?? null
  const decks = [students.slice(0, 5), students.slice(5, 10)]

  return (
    <section className="cards-view" aria-label="Student cards">
      <div className="deck-board">
        {decks.map((deck, deckIndex) => (
          <div className="student-deck" key={`deck-${deckIndex}`}>
            {deck.map((student, index) => (
              <button
                type="button"
                className={`deck-card alert-${student.alert_level} ${expandedId === student.id ? 'selected-card' : ''}`}
                key={student.id}
                style={{
                  '--card-index': index,
                  '--card-tilt': `${(index - 2) * 1.8}deg`,
                  '--status': toHex(statusColors[student.current_status]),
                } as React.CSSProperties}
                onClick={() => setExpandedId(student.id)}
              >
                <span className="deck-card-topline">
                  <strong>{student.display_name}</strong>
                  <span>{statusLabels[student.current_status]}</span>
                </span>
                <p>{student.minder_summary}</p>
              </button>
            ))}
          </div>
        ))}
      </div>

      {expandedStudent && (
        <ExpandedStudentCard
          student={expandedStudent}
          onClose={() => setExpandedId(null)}
          onOpenClassroom={() => onSelect(expandedStudent.id)}
        />
      )}
    </section>
  )
}

function ExpandedStudentCard({ student, onClose, onOpenClassroom }: { student: Student; onClose: () => void; onOpenClassroom: () => void }) {
  const [activeAssignmentId, setActiveAssignmentId] = useState(student.assignments[0]?.assignment_id ?? '')
  const [selectedSupport, setSelectedSupport] = useState('')
  const [supportPreview, setSupportPreview] = useState('')
  const [supportStage, setSupportStage] = useState<'idle' | 'transforming' | 'review' | 'approved' | 'sending' | 'sent'>('idle')
  const [supportNotes, setSupportNotes] = useState('')
  const [deliveredSupport, setDeliveredSupport] = useState('')
  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const supportFlags = Object.keys(student.accommodation_flags)
  const activeAssignment = student.assignments.find((assignment) => assignment.assignment_id === activeAssignmentId) ?? student.assignments[0]
  const activeSupportResult = activeAssignment && selectedSupport
    ? cachedSupportResults[activeAssignment.assignment_id]?.[selectedSupport]
    : undefined
  const activeTtsResult = activeAssignment && selectedSupport === 'text_to_speech'
    ? cachedTtsResults[activeAssignment.assignment_id]
    : undefined
  const deliveredSupportResult = activeAssignment && deliveredSupport
    ? cachedSupportResults[activeAssignment.assignment_id]?.[deliveredSupport]
    : undefined
  const deliveredTtsResult = activeAssignment && deliveredSupport === 'text_to_speech'
    ? cachedTtsResults[activeAssignment.assignment_id]
    : undefined

  const loadSupportPreview = useCallback((support: string) => {
    setSelectedSupport(support)
    setSupportPreview('')
    setSupportNotes('')
    const supportResult = cachedSupportResults[activeAssignment?.assignment_id ?? '']?.[support]
    const ttsResult = support === 'text_to_speech' ? cachedTtsResults[activeAssignment?.assignment_id ?? ''] : undefined
    if (!supportResult && !ttsResult) return
    if (supportResult) setSupportPreview(supportResult.content)
    setSupportOpen(true)
    if (ttsResult) {
      setSupportStage('review')
    } else {
      setSupportStage('transforming')
      window.setTimeout(() => {
        setSupportStage('review')
      }, 5000)
    }
  }, [activeAssignment?.assignment_id])

  const selectAssignment = useCallback((assignmentId: string) => {
    setActiveAssignmentId(assignmentId)
    setSelectedSupport('')
    setSupportPreview('')
    setSupportStage('idle')
    setSupportNotes('')
    setDeliveredSupport('')
    setAssignmentOpen(true)
    setSupportOpen(false)
  }, [])

  const rejectSupport = useCallback(() => {
    setSelectedSupport('')
    setSupportPreview('')
    setSupportStage('idle')
    setSupportNotes('')
    setSupportOpen(false)
  }, [])

  const sendApprovedSupport = useCallback(() => {
    if (!selectedSupport) return
    setSupportStage('sending')
    window.setTimeout(() => {
      setDeliveredSupport(selectedSupport)
      setSupportStage('sent')
      window.setTimeout(() => {
        setSelectedSupport('')
        setSupportPreview('')
        setSupportNotes('')
        setSupportStage('idle')
        setSupportOpen(false)
      }, 900)
    }, 2000)
  }, [selectedSupport])

  return (
    <article className={`expanded-student-card alert-${student.alert_level}`}>
      <button type="button" className="bubble-close" onClick={onClose} aria-label="Close expanded student card">
        <X size={16} />
      </button>
      <header>
        <div>
          <p className="eyebrow">{student.profile_type.replaceAll('_', ' ')}</p>
          <h2>{student.display_name}</h2>
        </div>
        <span className="card-status" style={{ '--status': toHex(statusColors[student.current_status]) } as React.CSSProperties}>
          {statusLabels[student.current_status]}
        </span>
      </header>
      <p>{student.minder_summary}</p>
      <section className="metric-grid">
        <Metric label="Focus" value={student.focus_score} max={18} />
        <Metric label="Confusion" value={student.confusion_score} max={18} />
        <Metric label="Engagement" value={student.engagement_level} max={100} />
      </section>
      <section>
        <h3>Assignments</h3>
        <div className="card-assignments">
          {student.assignments.map((assignment) => (
            <button
              type="button"
              key={assignment.assignment_id}
              className={assignment.assignment_id === activeAssignment?.assignment_id ? 'active-assignment' : ''}
              onClick={() => selectAssignment(assignment.assignment_id)}
            >
              <ClipboardList size={15} />
              <span>{assignment.title}</span>
              <small>{assignment.progress_percent}%</small>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>Approved Supports</h3>
        <div className="card-supports">
          {supportFlags.length
            ? supportFlags.map((flag) => {
                const hasCachedResult = Boolean(
                  cachedSupportResults[activeAssignment?.assignment_id ?? '']?.[flag] ||
                  (flag === 'text_to_speech' && cachedTtsResults[activeAssignment?.assignment_id ?? '']),
                )
                return (
                  <button
                    type="button"
                    key={flag}
                    className={selectedSupport === flag ? 'active-support' : ''}
                    onClick={() => loadSupportPreview(flag)}
                  >
                    {flag.replaceAll('_', ' ')}
                    {!hasCachedResult && <small>No cached demo result</small>}
                  </button>
                )
              })
            : <span>No simulated support flags</span>}
        </div>
      </section>
      {activeAssignment && (
        <footer>
          <span>{activeAssignment.simulated_course}</span>
          <button type="button" onClick={onOpenClassroom}>Open In Classroom</button>
        </footer>
      )}
      {activeAssignment && assignmentOpen && (
        <section className="review-bubble assignment-review-bubble" aria-label={`${activeAssignment.title} assignment preview`}>
          <button type="button" className="bubble-close" onClick={() => setAssignmentOpen(false)} aria-label="Close assignment preview">
            <X size={16} />
          </button>
          <h3>Assignment Workspace</h3>
          <strong>{deliveredSupportResult?.title ?? deliveredTtsResult?.title ?? activeAssignment.title}</strong>
          {deliveredSupportResult
            ? (
                <>
                  <p>Approved accommodated version is ready for this student.</p>
                  <pre>{deliveredSupportResult.content}</pre>
                </>
              )
            : deliveredTtsResult
              ? (
                  <>
                    <p>Approved text-to-speech audio is attached for this student.</p>
                    <TtsClipList clips={deliveredTtsResult.clips} />
                  </>
                )
            : (
                <>
                  {activeAssignment.description && <p>{activeAssignment.description}</p>}
                  {activeAssignment.asset_url
                    ? <img src={activeAssignment.asset_url} alt={`${activeAssignment.title} worksheet`} />
                    : <p>{activeAssignment.simulated_course} assignment preview unavailable.</p>}
                </>
              )}
        </section>
      )}
      {selectedSupport && supportOpen && (
        <section className={`review-bubble accommodation-review-bubble stage-${supportStage}`}>
          <button type="button" className="bubble-close" onClick={rejectSupport} aria-label="Close accommodation preview">
            <X size={16} />
          </button>
          <h3>{activeTtsResult ? 'Text-To-Speech Preview' : 'Accommodation Preview'}</h3>
          <strong>{activeSupportResult?.title ?? activeTtsResult?.title ?? `${selectedSupport.replaceAll('_', ' ')} preview unavailable`}</strong>
          {activeTtsResult
            ? (
                <>
                  <p>Review the generated audio clips for this assignment.</p>
                  <TtsClipList clips={activeTtsResult.clips} />
                  {supportStage === 'review' && (
                    <>
                      <label className="support-notes">
                        Recommend specific changes to the text-to-speech agent
                        <textarea
                          value={supportNotes}
                          onChange={(event) => setSupportNotes(event.target.value)}
                          placeholder="Example: read problem 3 more slowly, and pause before the final operation."
                        />
                      </label>
                      <div className="review-actions">
                        <button type="button" onClick={() => setSupportStage('approved')}>Approve Audio</button>
                        <button type="button" className="reject-action" onClick={rejectSupport}>Reject Audio</button>
                      </div>
                    </>
                  )}
                  {supportStage === 'approved' && (
                    <div className="approval-actions">
                      <p className="approval-note">Approved. Sending is still simulated in this prototype.</p>
                      <button type="button" onClick={sendApprovedSupport}>Send to Student</button>
                    </div>
                  )}
                  {supportStage === 'sending' && (
                    <div className="sending-state">
                      <div className="send-bar" />
                      <p>Sending text-to-speech audio...</p>
                    </div>
                  )}
                  {supportStage === 'sent' && <p className="approval-note">Sent. Returning to the student bubble.</p>}
                </>
              )
            : activeSupportResult
            ? (
                <>
                  <div className="accommodation-transform">
                    <div className="original-lesson">
                      <span>Original Assignment</span>
                      {activeAssignment?.asset_url
                        ? <img src={activeAssignment.asset_url} alt={`${activeAssignment.title} original worksheet`} />
                        : <p>{activeAssignment?.title}</p>}
                    </div>
                    <div className="reveal-line" />
                    <div className="rebuilt-lesson">
                      <span>Rebuilt Assignment</span>
                      <pre>{supportPreview}</pre>
                    </div>
                  </div>
                  {supportStage === 'review' && (
                    <>
                      <label className="support-notes">
                        Recommend specific changes to the accommodations agent
                        <textarea
                          value={supportNotes}
                          onChange={(event) => setSupportNotes(event.target.value)}
                          placeholder="Example: keep the checklist, but reduce repeated directions after problem 3."
                        />
                      </label>
                      <div className="review-actions">
                        <button type="button" onClick={() => setSupportStage('approved')}>Approve Lesson</button>
                        <button type="button" className="reject-action" onClick={rejectSupport}>Reject Assignment</button>
                      </div>
                    </>
                  )}
                  {supportStage === 'approved' && (
                    <div className="approval-actions">
                      <p className="approval-note">Approved. Sending is still simulated in this prototype.</p>
                      <button type="button" onClick={sendApprovedSupport}>Send to Student</button>
                    </div>
                  )}
                  {supportStage === 'sending' && (
                    <div className="sending-state">
                      <div className="send-bar" />
                      <p>Sending accommodated assignment...</p>
                    </div>
                  )}
                  {supportStage === 'sent' && <p className="approval-note">Sent. Returning to the student bubble.</p>}
                </>
              )
            : <p>No cached accommodation result is available for this assignment and support yet.</p>}
        </section>
      )}
    </article>
  )
}

function StudentBubble({ student, onClose }: { student: Student; onClose: () => void }) {
  const [activeAssignmentId, setActiveAssignmentId] = useState(student.assignments[0]?.assignment_id ?? '')
  const [selectedSupport, setSelectedSupport] = useState('')
  const [supportPreview, setSupportPreview] = useState('')
  const [supportStage, setSupportStage] = useState<'idle' | 'transforming' | 'review' | 'approved' | 'sending' | 'sent'>('idle')
  const [supportNotes, setSupportNotes] = useState('')
  const [deliveredSupport, setDeliveredSupport] = useState('')
  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const events = [...(student.minder_events ?? []), ...(student.tutor_events ?? [])]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 8)
  const activeAssignment = student.assignments.find((assignment) => assignment.assignment_id === activeAssignmentId) ?? student.assignments[0]
  const activeSupportResult = activeAssignment && selectedSupport
    ? cachedSupportResults[activeAssignment.assignment_id]?.[selectedSupport]
    : undefined
  const activeTtsResult = activeAssignment && selectedSupport === 'text_to_speech'
    ? cachedTtsResults[activeAssignment.assignment_id]
    : undefined
  const deliveredSupportResult = activeAssignment && deliveredSupport
    ? cachedSupportResults[activeAssignment.assignment_id]?.[deliveredSupport]
    : undefined
  const deliveredTtsResult = activeAssignment && deliveredSupport === 'text_to_speech'
    ? cachedTtsResults[activeAssignment.assignment_id]
    : undefined

  const loadSupportPreview = useCallback((support: string) => {
    setSelectedSupport(support)
    setSupportPreview('')
    setSupportNotes('')
    const supportResult = cachedSupportResults[activeAssignment?.assignment_id ?? '']?.[support]
    const ttsResult = support === 'text_to_speech' ? cachedTtsResults[activeAssignment?.assignment_id ?? ''] : undefined
    if (!supportResult && !ttsResult) return
    if (supportResult) setSupportPreview(supportResult.content)
    setSupportOpen(true)
    if (ttsResult) {
      setSupportStage('review')
    } else {
      setSupportStage('transforming')
      window.setTimeout(() => {
        setSupportStage('review')
      }, 5000)
    }
  }, [activeAssignment?.assignment_id])

  const selectAssignment = useCallback((assignmentId: string) => {
    setActiveAssignmentId(assignmentId)
    setSelectedSupport('')
    setSupportPreview('')
    setSupportStage('idle')
    setSupportNotes('')
    setDeliveredSupport('')
    setAssignmentOpen(true)
    setSupportOpen(false)
  }, [])

  const rejectSupport = useCallback(() => {
    setSelectedSupport('')
    setSupportPreview('')
    setSupportStage('idle')
    setSupportNotes('')
    setSupportOpen(false)
  }, [])

  const sendApprovedSupport = useCallback(() => {
    if (!selectedSupport) return
    setSupportStage('sending')
    window.setTimeout(() => {
      setDeliveredSupport(selectedSupport)
      setSupportStage('sent')
      window.setTimeout(() => {
        setSelectedSupport('')
        setSupportPreview('')
        setSupportNotes('')
        setSupportStage('idle')
        setSupportOpen(false)
      }, 900)
    }, 2000)
  }, [selectedSupport])

  return (
    <aside className="student-bubble" aria-label={`${student.display_name} student details`}>
      <button type="button" className="bubble-close" onClick={onClose} aria-label="Close student details">
        <X size={16} />
      </button>
      <p className="eyebrow">Selected Student</p>
      <h2>{student.display_name}</h2>
      <div className={`status-card alert-${student.alert_level}`}>
        <AlertTriangle size={18} />
        <div>
          <strong>{statusLabels[student.current_status]}</strong>
          <span>{student.alert_level} alert</span>
        </div>
      </div>
      <section>
        <h3>Minder Summary</h3>
        <p>{student.minder_summary}</p>
      </section>
      <section className="metric-grid">
        <Metric label="Focus" value={student.focus_score} max={18} />
        <Metric label="Confusion" value={student.confusion_score} max={18} />
        <Metric label="Engagement" value={student.engagement_level} max={100} />
      </section>
      <section>
        <h3>Assignments</h3>
        <div className="assignments">
          {student.assignments.map((assignment) => (
            <button
              type="button"
              key={assignment.assignment_id}
              className={assignment.assignment_id === activeAssignment?.assignment_id ? 'active-assignment' : ''}
              onClick={() => selectAssignment(assignment.assignment_id)}
            >
              <ClipboardList size={16} />
              <span>{assignment.title}</span>
              <progress value={assignment.progress_percent} max={100} />
              <small>{assignment.progress_percent}% - {assignment.simulated_course}</small>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>Approved Supports</h3>
        <div className="support-list">
          {Object.keys(student.accommodation_flags).length
            ? Object.keys(student.accommodation_flags).map((flag) => {
                const hasCachedResult = Boolean(
                  cachedSupportResults[activeAssignment?.assignment_id ?? '']?.[flag] ||
                  (flag === 'text_to_speech' && cachedTtsResults[activeAssignment?.assignment_id ?? '']),
                )
                return (
                  <button
                    type="button"
                    key={flag}
                    className={selectedSupport === flag ? 'active-support' : ''}
                    onClick={() => loadSupportPreview(flag)}
                  >
                    {flag.replaceAll('_', ' ')}
                    {!hasCachedResult && <small>No cached demo result</small>}
                  </button>
                )
              })
            : <span>No simulated support flags</span>}
        </div>
      </section>
      <details className="student-history">
        <summary>
          <span>Student History</span>
          <ChevronDown size={16} />
        </summary>
        <div className="event-list">
          {events.map((event) => (
            <article key={`${event.event_type}-${event.id}`}>
              <strong>{event.event_type.replaceAll('_', ' ')}</strong>
              <p>{event.message}</p>
            </article>
          ))}
        </div>
      </details>
      {activeAssignment && assignmentOpen && (
        <section className="review-bubble assignment-review-bubble" aria-label={`${activeAssignment.title} assignment preview`}>
          <button type="button" className="bubble-close" onClick={() => setAssignmentOpen(false)} aria-label="Close assignment preview">
            <X size={16} />
          </button>
          <h3>Assignment Workspace</h3>
          <strong>{deliveredSupportResult?.title ?? deliveredTtsResult?.title ?? activeAssignment.title}</strong>
          {deliveredSupportResult
            ? (
                <>
                  <p>Approved accommodated version is ready for this student.</p>
                  <pre>{deliveredSupportResult.content}</pre>
                </>
              )
            : deliveredTtsResult
              ? (
                  <>
                    <p>Approved text-to-speech audio is attached for this student.</p>
                    <TtsClipList clips={deliveredTtsResult.clips} />
                  </>
                )
            : (
                <>
                  {activeAssignment.description && <p>{activeAssignment.description}</p>}
                  {activeAssignment.asset_url
                    ? <img src={activeAssignment.asset_url} alt={`${activeAssignment.title} worksheet`} />
                    : <p>{activeAssignment.simulated_course} assignment preview unavailable.</p>}
                </>
              )}
        </section>
      )}
      {selectedSupport && supportOpen && (
        <section className={`review-bubble accommodation-review-bubble stage-${supportStage}`}>
          <button type="button" className="bubble-close" onClick={rejectSupport} aria-label="Close accommodation preview">
            <X size={16} />
          </button>
          <h3>{activeTtsResult ? 'Text-To-Speech Preview' : 'Accommodation Preview'}</h3>
          <strong>{activeSupportResult?.title ?? activeTtsResult?.title ?? `${selectedSupport.replaceAll('_', ' ')} preview unavailable`}</strong>
          {activeTtsResult
            ? (
                <>
                  <p>Review the generated audio clips for this assignment.</p>
                  <TtsClipList clips={activeTtsResult.clips} />
                  {supportStage === 'review' && (
                    <>
                      <label className="support-notes">
                        Recommend specific changes to the text-to-speech agent
                        <textarea
                          value={supportNotes}
                          onChange={(event) => setSupportNotes(event.target.value)}
                          placeholder="Example: read problem 3 more slowly, and pause before the final operation."
                        />
                      </label>
                      <div className="review-actions">
                        <button type="button" onClick={() => setSupportStage('approved')}>Approve Audio</button>
                        <button type="button" className="reject-action" onClick={rejectSupport}>Reject Audio</button>
                      </div>
                    </>
                  )}
                  {supportStage === 'approved' && (
                    <div className="approval-actions">
                      <p className="approval-note">Approved. Sending is still simulated in this prototype.</p>
                      <button type="button" onClick={sendApprovedSupport}>Send to Student</button>
                    </div>
                  )}
                  {supportStage === 'sending' && (
                    <div className="sending-state">
                      <div className="send-bar" />
                      <p>Sending text-to-speech audio...</p>
                    </div>
                  )}
                  {supportStage === 'sent' && <p className="approval-note">Sent. Returning to the student bubble.</p>}
                </>
              )
            : activeSupportResult
            ? (
                <>
                  <div className="accommodation-transform">
                    <div className="original-lesson">
                      <span>Original Assignment</span>
                      {activeAssignment?.asset_url
                        ? <img src={activeAssignment.asset_url} alt={`${activeAssignment.title} original worksheet`} />
                        : <p>{activeAssignment?.title}</p>}
                    </div>
                    <div className="reveal-line" />
                    <div className="rebuilt-lesson">
                      <span>Rebuilt Assignment</span>
                      <pre>{supportPreview}</pre>
                    </div>
                  </div>
                  {supportStage === 'review' && (
                    <>
                      <label className="support-notes">
                        Recommend specific changes to the accommodations agent
                        <textarea
                          value={supportNotes}
                          onChange={(event) => setSupportNotes(event.target.value)}
                          placeholder="Example: keep the checklist, but reduce repeated directions after problem 3."
                        />
                      </label>
                      <div className="review-actions">
                        <button type="button" onClick={() => setSupportStage('approved')}>Approve Lesson</button>
                        <button type="button" className="reject-action" onClick={rejectSupport}>Reject Assignment</button>
                      </div>
                    </>
                  )}
                  {supportStage === 'approved' && (
                    <div className="approval-actions">
                      <p className="approval-note">Approved. Sending is still simulated in this prototype.</p>
                      <button type="button" onClick={sendApprovedSupport}>Send to Student</button>
                    </div>
                  )}
                  {supportStage === 'sending' && (
                    <div className="sending-state">
                      <div className="send-bar" />
                      <p>Sending accommodated assignment...</p>
                    </div>
                  )}
                  {supportStage === 'sent' && <p className="approval-note">Sent. Returning to the student bubble.</p>}
                </>
              )
            : <p>No cached accommodation result is available for this assignment and support yet.</p>}
        </section>
      )}
    </aside>
  )
}

function TtsClipList({ clips }: { clips: TtsClip[] }) {
  return (
    <div className="tts-clip-list">
      {clips.map((clip) => (
        <article key={clip.url} className="tts-clip">
          <strong>{clip.label}</strong>
          <audio controls preload="none" src={clip.url}>
            <a href={clip.url}>Open audio</a>
          </audio>
        </article>
      ))}
    </div>
  )
}

function Metric({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <progress value={value} max={max} />
    </div>
  )
}

function markerFor(status: StudentStatus) {
  if (status === 'confused') return '???'
  if (status === 'needs_help') return '!!!'
  if (status === 'escalation') return '!!!'
  if (status === 'off_task') return ''
  if (status === 'playing_games') return 'GAME'
  if (status === 'talking_with_friends') return 'CHAT'
  if (status === 'using_accommodation') return 'OK'
  return ''
}

function toHex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`
}

export default App
