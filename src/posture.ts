import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

const NOSE = 0
const LEFT_EAR = 7
const RIGHT_EAR = 8
const LEFT_SHOULDER = 11
const RIGHT_SHOULDER = 12

const MIN_VISIBILITY = 0.5

export interface PostureMetrics {
  /** Ear-to-shoulder vertical gap over shoulder width. Shrinks when the neck collapses. */
  neckRatio: number
  /** Shoulder width in frame units. Grows as the body moves toward the camera. */
  shoulderWidth: number
  /** Shoulder height difference over shoulder width. Non-zero when leaning to one side. */
  shoulderSlope: number
  /** Head offset from the shoulder midpoint over shoulder width. */
  headOffset: number
}

export interface PostureVerdict {
  good: boolean
  issues: string[]
}

/** Deviation from baseline that counts as bad posture at sensitivity 1. */
const LIMITS = {
  slouch: 0.09,
  lean: 0.13,
  shoulderSlope: 0.11,
  headOffset: 0.14,
}

export function measure(landmarks: NormalizedLandmark[]): PostureMetrics | null {
  const points = [NOSE, LEFT_EAR, RIGHT_EAR, LEFT_SHOULDER, RIGHT_SHOULDER].map((i) => landmarks[i])
  if (points.some((p) => !p || (p.visibility ?? 1) < MIN_VISIBILITY)) return null

  const [nose, leftEar, rightEar, leftShoulder, rightShoulder] = points
  const shoulderWidth = Math.hypot(
    leftShoulder.x - rightShoulder.x,
    leftShoulder.y - rightShoulder.y,
  )
  if (shoulderWidth < 0.05) return null

  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2
  const earMidY = (leftEar.y + rightEar.y) / 2

  return {
    neckRatio: (shoulderMidY - earMidY) / shoulderWidth,
    shoulderWidth,
    shoulderSlope: (leftShoulder.y - rightShoulder.y) / shoulderWidth,
    headOffset: (nose.x - shoulderMidX) / shoulderWidth,
  }
}

export function smooth(previous: PostureMetrics | null, next: PostureMetrics, weight = 0.25) {
  if (!previous) return next
  return {
    neckRatio: blend(previous.neckRatio, next.neckRatio, weight),
    shoulderWidth: blend(previous.shoulderWidth, next.shoulderWidth, weight),
    shoulderSlope: blend(previous.shoulderSlope, next.shoulderSlope, weight),
    headOffset: blend(previous.headOffset, next.headOffset, weight),
  }
}

export function average(samples: PostureMetrics[]): PostureMetrics {
  const total = samples.reduce(
    (sum, s) => ({
      neckRatio: sum.neckRatio + s.neckRatio,
      shoulderWidth: sum.shoulderWidth + s.shoulderWidth,
      shoulderSlope: sum.shoulderSlope + s.shoulderSlope,
      headOffset: sum.headOffset + s.headOffset,
    }),
    { neckRatio: 0, shoulderWidth: 0, shoulderSlope: 0, headOffset: 0 },
  )
  return {
    neckRatio: total.neckRatio / samples.length,
    shoulderWidth: total.shoulderWidth / samples.length,
    shoulderSlope: total.shoulderSlope / samples.length,
    headOffset: total.headOffset / samples.length,
  }
}

export function evaluate(
  baseline: PostureMetrics,
  current: PostureMetrics,
  sensitivity: number,
): PostureVerdict {
  const limit = (value: number) => value / sensitivity
  const issues: string[] = []

  if (current.neckRatio < baseline.neckRatio - limit(LIMITS.slouch)) {
    issues.push('Head dropping toward your shoulders — lengthen your neck')
  }
  if (current.shoulderWidth > baseline.shoulderWidth * (1 + limit(LIMITS.lean))) {
    issues.push('Leaning in toward the screen — sit back')
  }
  if (Math.abs(current.shoulderSlope - baseline.shoulderSlope) > limit(LIMITS.shoulderSlope)) {
    issues.push('Shoulders uneven — level them out')
  }
  if (Math.abs(current.headOffset - baseline.headOffset) > limit(LIMITS.headOffset)) {
    issues.push('Head drifting off center — square up to the screen')
  }

  return { good: issues.length === 0, issues }
}

function blend(a: number, b: number, weight: number) {
  return a * (1 - weight) + b * weight
}
