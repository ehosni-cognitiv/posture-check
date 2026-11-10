import { cp, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The wasm runtime must match the installed @mediapipe/tasks-vision exactly, so it is
// copied out of node_modules instead of pulled from a CDN at a hand-written version.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const target = resolve(root, 'public/wasm')

await mkdir(dirname(target), { recursive: true })
await cp(source, target, { recursive: true })
