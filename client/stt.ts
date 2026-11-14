// Walter's ears: speech to text with ElevenLabs Scribe.
// Runs on the server so the ElevenLabs key never reaches the browser.
import { ElevenLabsClient, ElevenLabsError } from '@elevenlabs/elevenlabs-js'
import { TtsError, type TtsConfig } from './tts.js'

const MODEL = 'scribe_v2'
// Base64 of about 2 minutes of compressed speech; also under Vercel's 4.5 MB body limit.
export const MAX_AUDIO_CHARS = 3_000_000
const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)(;.*)?$/

// What the customer said in `audio` (base64 of a short recording from the browser).
export async function transcribe(config: TtsConfig, audio: unknown, mimeType: unknown): Promise<{ text: string }> {
  if (!config.apiKey) throw new TtsError(503, 'Set ELEVENLABS_API_KEY in .env.local')
  if (typeof audio !== 'string' || !audio) throw new TtsError(400, 'Invalid audio')
  if (audio.length > MAX_AUDIO_CHARS) throw new TtsError(413, 'Recording too long')
  const type = typeof mimeType === 'string' && AUDIO_TYPES.test(mimeType) ? mimeType : 'audio/webm'

  const bytes = Buffer.from(audio, 'base64')
  if (bytes.length < 1000) return { text: '' } // too short to hold a word
  const client = new ElevenLabsClient({ apiKey: config.apiKey })
  try {
    const result = await client.speechToText.convert({
      modelId: MODEL,
      file: new Blob([bytes], { type: type.split(';')[0] }),
      tagAudioEvents: false,
    })
    const text = 'text' in result && typeof result.text === 'string' ? result.text : ''
    return { text: text.trim() }
  } catch (e) {
    const status = e instanceof ElevenLabsError ? e.statusCode : undefined
    console.error('[stt] ElevenLabs request failed', { status, message: e instanceof Error ? e.message : e })
    throw new TtsError(502, status ? `ElevenLabs request failed (${status})` : 'Could not reach ElevenLabs')
  }
}
