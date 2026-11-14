// Walter's voice: text to speech with the ElevenLabs SDK.
// Runs on the server so the ElevenLabs key never reaches the browser.
import { ElevenLabsClient, ElevenLabsError } from '@elevenlabs/elevenlabs-js'

export type TtsConfig = {
  apiKey?: string
  voiceId?: string
  model?: string
}

export class TtsError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// "George": a warm, narrative male voice from ElevenLabs' premade library.
const DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb'
// Flash is the low-latency model, so Walter starts talking quickly in the chat.
const DEFAULT_MODEL = 'eleven_flash_v2_5'
export const MAX_TTS_CHARS = 2500

// MP3 audio of Walter saying `text`.
export async function speech(config: TtsConfig, text: unknown): Promise<Uint8Array> {
  if (!config.apiKey) throw new TtsError(503, 'Set ELEVENLABS_API_KEY in .env.local')
  if (typeof text !== 'string' || !text.trim()) throw new TtsError(400, 'Invalid text')
  if (text.length > MAX_TTS_CHARS) throw new TtsError(413, 'Text too long')

  const client = new ElevenLabsClient({ apiKey: config.apiKey })
  try {
    const audio = await client.textToSpeech.convert(config.voiceId || DEFAULT_VOICE, {
      text: text.trim(),
      modelId: config.model || DEFAULT_MODEL,
      outputFormat: 'mp3_44100_128',
      voiceSettings: { stability: 0.5, similarityBoost: 0.75 },
    })
    return new Uint8Array(await new Response(audio).arrayBuffer())
  } catch (e) {
    const status = e instanceof ElevenLabsError ? e.statusCode : undefined
    console.error('[tts] ElevenLabs request failed', { status, message: e instanceof Error ? e.message : e })
    throw new TtsError(502, status ? `ElevenLabs request failed (${status})` : 'Could not reach ElevenLabs')
  }
}
