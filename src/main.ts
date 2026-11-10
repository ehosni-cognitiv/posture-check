import type { PoseLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { createPoseLandmarker } from './pose'
import { playChime, requestAlertPermission, sendAlert } from './notify'
import { average, evaluate, measure, smooth, type PostureMetrics } from './posture'
import './style.css'

const CALIBRATION_MS = 2500
const REPEAT_ALERT_MS = 60_000
const RECOVERY_MS = 3000

const video = element<HTMLVideoElement>('video')
const overlay = element<HTMLCanvasElement>('overlay')
const verdict = element<HTMLDivElement>('verdict')
const status = element<HTMLParagraphElement>('status')
const issueList = element<HTMLUListElement>('issues')
const startButton = element<HTMLButtonElement>('start')
const calibrateButton = element<HTMLButtonElement>('calibrate')
const stopButton = element<HTMLButtonElement>('stop')
const sensitivityInput = element<HTMLInputElement>('sensitivity')
const sensitivityValue = element<HTMLSpanElement>('sensitivityValue')
const holdInput = element<HTMLInputElement>('hold')
const holdValue = element<HTMLSpanElement>('holdValue')
const soundInput = element<HTMLInputElement>('sound')
const goodTimeValue = element<HTMLElement>('goodTime')
const badTimeValue = element<HTMLElement>('badTime')
const alertCountValue = element<HTMLElement>('alertCount')

const context = overlay.getContext('2d')!

let landmarker: PoseLandmarker | null = null
let stream: MediaStream | null = null
let frameHandle = 0
let lastVideoTime = -1
let lastFrameAt = 0

let current: PostureMetrics | null = null
let baseline: PostureMetrics | null = null
let calibrationSamples: PostureMetrics[] | null = null
let calibrationEndsAt = 0

let badSince = 0
let goodSince = 0
let lastAlertAt = 0
let goodMs = 0
let badMs = 0
let alerts = 0

startButton.addEventListener('click', () => void start())
stopButton.addEventListener('click', stop)
calibrateButton.addEventListener('click', beginCalibration)
sensitivityInput.addEventListener('input', renderSettings)
holdInput.addEventListener('input', renderSettings)
renderSettings()

async function start() {
  startButton.disabled = true
  try {
    setStatus('Loading posture model…')
    landmarker ??= await createPoseLandmarker()

    setStatus('Starting camera…')
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: 'user' },
    })
    video.srcObject = stream
    await video.play()

    overlay.width = video.videoWidth
    overlay.height = video.videoHeight

    await requestAlertPermission()

    stopButton.disabled = false
    calibrateButton.disabled = false
    setStatus('Sit the way you want to sit, then calibrate.')
    lastFrameAt = performance.now()
    frameHandle = requestAnimationFrame(tick)
  } catch (error) {
    startButton.disabled = false
    setStatus(`Could not start: ${(error as Error).message}`)
  }
}

function stop() {
  cancelAnimationFrame(frameHandle)
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  video.srcObject = null
  context.clearRect(0, 0, overlay.width, overlay.height)

  baseline = null
  current = null
  calibrationSamples = null
  badSince = 0
  goodSince = 0

  startButton.disabled = false
  stopButton.disabled = true
  calibrateButton.disabled = true
  verdict.classList.add('hidden')
  issueList.replaceChildren()
  setStatus('Camera off')
}

function beginCalibration() {
  calibrationSamples = []
  calibrationEndsAt = performance.now() + CALIBRATION_MS
  baseline = null
  badSince = 0
  goodSince = 0
  verdict.classList.add('hidden')
  issueList.replaceChildren()
}

function tick() {
  frameHandle = requestAnimationFrame(tick)
  if (!landmarker || video.readyState < 2) return

  const now = performance.now()
  const elapsed = now - lastFrameAt
  lastFrameAt = now

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime
    const result = landmarker.detectForVideo(video, now)
    const landmarks = result.landmarks[0]
    const metrics = landmarks ? measure(landmarks) : null

    drawSkeleton(landmarks)
    current = metrics ? smooth(current, metrics) : null

    if (!metrics) {
      setStatus('Looking for you — make sure your head and shoulders are in frame.')
      return
    }
  }

  if (!current) return

  if (calibrationSamples) {
    runCalibration(current, now)
    return
  }
  if (baseline) scorePosture(baseline, current, now, elapsed)
}

function runCalibration(metrics: PostureMetrics, now: number) {
  calibrationSamples!.push(metrics)
  const remaining = Math.max(0, calibrationEndsAt - now)
  if (remaining > 0) {
    setStatus(`Hold your best posture… ${(remaining / 1000).toFixed(1)}s`)
    return
  }

  baseline = average(calibrationSamples!)
  calibrationSamples = null
  goodSince = now
  lastAlertAt = 0
  setStatus('Watching your posture.')
  showVerdict(true, [])
}

function scorePosture(
  reference: PostureMetrics,
  metrics: PostureMetrics,
  now: number,
  elapsed: number,
) {
  const sensitivity = Number(sensitivityInput.value)
  const holdMs = Number(holdInput.value) * 1000
  const { good, issues } = evaluate(reference, metrics, sensitivity)

  if (good) {
    goodMs += elapsed
    badSince = 0
    goodSince ||= now
    if (now - goodSince > RECOVERY_MS) lastAlertAt = 0
  } else {
    badMs += elapsed
    goodSince = 0
    badSince ||= now
    const sustained = now - badSince >= holdMs
    const cooledDown = lastAlertAt === 0 || now - lastAlertAt >= REPEAT_ALERT_MS
    if (sustained && cooledDown) raiseAlert(issues, now)
  }

  showVerdict(good, issues)
  renderStats()
}

function raiseAlert(issues: string[], now: number) {
  lastAlertAt = now
  alerts += 1
  sendAlert('Fix your posture', issues.join('\n'))
  if (soundInput.checked) playChime()
  verdict.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
    { duration: 400 },
  )
}

const CONNECTIONS: Array<[number, number]> = [
  [7, 0],
  [8, 0],
  [11, 12],
  [11, 7],
  [12, 8],
  [11, 23],
  [12, 24],
  [23, 24],
]

function drawSkeleton(landmarks: NormalizedLandmark[] | undefined) {
  context.clearRect(0, 0, overlay.width, overlay.height)
  if (!landmarks) return

  context.strokeStyle = baseline ? 'rgba(96, 230, 180, 0.9)' : 'rgba(255, 255, 255, 0.7)'
  context.fillStyle = context.strokeStyle
  context.lineWidth = 4

  for (const [from, to] of CONNECTIONS) {
    const a = landmarks[from]
    const b = landmarks[to]
    if (!a || !b) continue
    context.beginPath()
    context.moveTo(a.x * overlay.width, a.y * overlay.height)
    context.lineTo(b.x * overlay.width, b.y * overlay.height)
    context.stroke()
  }

  for (const index of [0, 7, 8, 11, 12]) {
    const point = landmarks[index]
    if (!point) continue
    context.beginPath()
    context.arc(point.x * overlay.width, point.y * overlay.height, 5, 0, Math.PI * 2)
    context.fill()
  }
}

function showVerdict(good: boolean, issues: string[]) {
  verdict.classList.remove('hidden')
  verdict.classList.toggle('good', good)
  verdict.classList.toggle('bad', !good)
  verdict.textContent = good ? 'Posture looks good' : 'Bad posture'
  issueList.replaceChildren(
    ...issues.map((issue) => {
      const item = document.createElement('li')
      item.textContent = issue
      return item
    }),
  )
}

function renderStats() {
  goodTimeValue.textContent = formatDuration(goodMs)
  badTimeValue.textContent = formatDuration(badMs)
  alertCountValue.textContent = String(alerts)
}

function renderSettings() {
  sensitivityValue.textContent = Number(sensitivityInput.value).toFixed(1)
  holdValue.textContent = `${holdInput.value}s`
}

function setStatus(message: string) {
  status.textContent = message
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`
}

function element<T extends HTMLElement>(id: string) {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}
