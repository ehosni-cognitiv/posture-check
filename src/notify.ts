export async function requestAlertPermission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'default') return Notification.requestPermission()
  return Notification.permission
}

export function sendAlert(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  new Notification(title, { body, tag: 'posture-check', renotify: true } as NotificationOptions)
}

let audio: AudioContext | null = null

export function playChime() {
  audio ??= new AudioContext()
  if (audio.state === 'suspended') void audio.resume()

  const now = audio.currentTime
  const oscillator = audio.createOscillator()
  const gain = audio.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(660, now)
  oscillator.frequency.setValueAtTime(440, now + 0.16)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)

  oscillator.connect(gain).connect(audio.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.45)
}
