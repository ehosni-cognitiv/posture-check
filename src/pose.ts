import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

const WASM_PATH = '/wasm'
const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

export async function createPoseLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
  })
}
