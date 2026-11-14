import { useSyncExternalStore } from 'react'
import { parseReply } from './assistant'

// Walter's voice in the browser: whether he reads his replies aloud, and
// whether he is talking right now. Audio comes from /api/tts (ElevenLabs).

const MAX_CHARS = 2500 // the server's limit (tts.ts)
const STORAGE_KEY = 'walter-voice'

type State = { enabled: boolean; speaking: boolean; loading: boolean }

let state: State = { enabled: readEnabled(), speaking: false, loading: false }
const listeners = new Set<() => void>()
let audio: HTMLAudioElement | null = null
let request: AbortController | null = null

function readEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false // private browsing
  }
}

function set(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

export function useVoice(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export function setVoiceEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // private browsing: the choice lasts for this visit only
  }
  if (!enabled) stopSpeaking()
  set({ enabled })
}

// What Walter says out loud for a reply: its text, without charts, lookups,
// suggestions, web addresses or markdown marks.
export function speakableText(reply: string): string {
  const text = parseReply(reply)
    .filter((p): p is string => typeof p === 'string')
    .join('\n\n')
    .replace(/https:\/\/[^\s)]+/g, 'the link')
    .replace(/[*_`#>]+/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
  if (text.length <= MAX_CHARS) return text
  // Too long: stop at the last sentence that fits.
  const cut = text.slice(0, MAX_CHARS)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'), cut.lastIndexOf('? '), cut.lastIndexOf('! '))
  return end > 0 ? cut.slice(0, end + 1) : cut
}

export function stopSpeaking() {
  request?.abort()
  request = null
  if (audio) {
    audio.pause()
    URL.revokeObjectURL(audio.src)
    audio = null
  }
  if (state.speaking || state.loading) set({ speaking: false, loading: false })
}

// Walter reads `reply` aloud, cutting off whatever he was saying before.
export async function speak(reply: string): Promise<void> {
  const text = speakableText(reply)
  stopSpeaking()
  if (!text) return
  const controller = new AbortController()
  request = controller
  set({ loading: true })
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const error = (await res.json().catch(() => null))?.error
      throw new Error(error ?? `Request failed (${res.status})`)
    }
    const blob = await res.blob()
    if (controller.signal.aborted) return
    const player = new Audio(URL.createObjectURL(blob))
    audio = player
    request = null
    const done = () => {
      if (audio !== player) return
      URL.revokeObjectURL(player.src)
      audio = null
      set({ speaking: false })
    }
    player.onended = done
    player.onerror = done
    set({ loading: false, speaking: true })
    await player.play()
  } catch (e) {
    if (controller.signal.aborted) return
    console.error('[voice] Could not speak', e)
    stopSpeaking()
  }
}
