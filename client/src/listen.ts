// Walter's ears in the browser: record what the customer says, notice when they
// have stopped talking, and turn it into text with /api/stt (ElevenLabs Scribe).

const SILENCE_MS = 1300 // this long quiet after speech ends the turn
const NO_SPEECH_MS = 8000 // nobody spoke at all: give up listening
const MAX_MS = 60_000 // a turn never runs longer than this
const TICK_MS = 50

let stream: MediaStream | null = null

export function microphoneSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
}

// The microphone stays open for the whole conversation, so the browser asks once
// and its "recording" indicator does not flicker between turns.
async function microphone(): Promise<MediaStream> {
  if (stream?.active) return stream
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  return stream
}

export function releaseMicrophone() {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
}

export type Recording = {
  // End the turn now and keep what was said.
  finish(): void
  // Drop the turn.
  cancel(): void
  // What was said, or null when the turn was cancelled or nobody spoke.
  result: Promise<Blob | null>
}

// Start listening. `onLevel` gets the loudness (0–1) many times a second, for a meter.
export async function listen(onLevel?: (level: number) => void): Promise<Recording> {
  const mic = await microphone()
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t))
  const recorder = new MediaRecorder(mic, type ? { mimeType: type } : undefined)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)

  const context = new AudioContext()
  const analyser = context.createAnalyser()
  analyser.fftSize = 1024
  context.createMediaStreamSource(mic).connect(analyser)
  const samples = new Float32Array(analyser.fftSize)

  let keep = true
  let heard = false
  let quietSince = 0
  let floor = 0.01 // background noise, learned as we go
  const started = performance.now()

  const result = new Promise<Blob | null>((resolve) => {
    recorder.onstop = () => {
      clearInterval(timer)
      void context.close()
      onLevel?.(0)
      resolve(keep && heard && chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null)
    }
  })
  const end = (keepIt: boolean) => {
    keep = keepIt
    if (recorder.state !== 'inactive') recorder.stop()
  }

  // A timer rather than requestAnimationFrame, so listening goes on in a background tab.
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples)
    let sum = 0
    for (const s of samples) sum += s * s
    const rms = Math.sqrt(sum / samples.length)
    onLevel?.(Math.min(1, rms * 8))
    const now = performance.now()
    const loud = rms > Math.max(0.02, floor * 3)
    if (!loud) floor = floor * 0.95 + rms * 0.05
    if (loud) {
      heard = true
      quietSince = 0
    } else if (heard) {
      quietSince ||= now
      if (now - quietSince > SILENCE_MS) end(true)
    }
    if (!heard && now - started > NO_SPEECH_MS) end(false)
    if (now - started > MAX_MS) end(true)
  }, TICK_MS)

  recorder.start(250)
  return { finish: () => end(true), cancel: () => end(false), result }
}

// The text of a recording, from ElevenLabs Scribe ('' when no words were made out).
export async function transcribe(audio: Blob, signal?: AbortSignal): Promise<string> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(audio)
  })
  const res = await fetch('/api/stt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: base64, mimeType: audio.type }),
    signal,
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
  return typeof body?.text === 'string' ? body.text : ''
}
