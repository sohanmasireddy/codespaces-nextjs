import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageStreamWriter,
} from 'ai'
import {
  buildModelParameters,
  getModel,
  supportsMode,
} from '../../../lib/models'

type CloudflareMessage = {
  role: 'user' | 'assistant'
  content: string | Array<Record<string, unknown>>
}

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxImageBytes = 1_500_000
const maxRequestBytes = 3_500_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function filePartToImage(part: Record<string, unknown>) {
  const mediaType = part.mediaType
  const url = part.url
  if (typeof mediaType !== 'string' || !allowedImageTypes.has(mediaType)) {
    throw new Error('Only JPEG, PNG, and WebP image attachments are supported.')
  }
  if (typeof url !== 'string') {
    throw new Error('An image attachment could not be read.')
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url)
  if (!match || match[1] !== mediaType) {
    throw new Error('An image attachment has an invalid data format.')
  }
  const estimatedBytes = Math.floor((match[2].length * 3) / 4)
  if (estimatedBytes > maxImageBytes) {
    throw new Error('Each image must be smaller than 1.5 MB.')
  }

  return {
    content: { type: 'image_url', image_url: { url } },
    byteLength: estimatedBytes,
  }
}

function toCloudflareMessages(value: unknown): CloudflareMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 40) {
    throw new Error('A chat must contain between 1 and 40 messages.')
  }

  let imageCount = 0
  let imageBytes = 0

  return value.map((message): CloudflareMessage => {
    if (!isRecord(message) || (message.role !== 'user' && message.role !== 'assistant')) {
      throw new Error('The chat contains an unsupported message.')
    }

    const contentParts: Array<Record<string, unknown>> = []
    const parts = Array.isArray(message.parts) ? message.parts : []

    for (const part of parts) {
      if (!isRecord(part)) continue
      if (part.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
        contentParts.push({ type: 'text', text: part.text.slice(0, 100_000) })
      } else if (part.type === 'file' && message.role === 'user') {
        if (typeof part.mediaType === 'string' && part.mediaType.startsWith('video/')) {
          throw new Error('Video analysis is not supported. Remove the video or attach still images.')
        }
        const image = filePartToImage(part)
        imageCount += 1
        imageBytes += image.byteLength
        if (imageCount > 4 || imageBytes > 1_600_000) {
          throw new Error('Add up to four images with a combined size below 1.6 MB.')
        }
        contentParts.push(image.content)
      }
    }

    if (contentParts.length === 0) {
      throw new Error('A message must contain text or an image.')
    }

    const text = contentParts
      .filter((part) => part.type === 'text')
      .map((part) => String(part.text))
      .join('\n')
    const images = contentParts.filter((part) => part.type === 'image_url')
    return {
      role: message.role,
      content: images.length === 0 ? text : [...(text ? [{ type: 'text', text }] : []), ...images],
    }
  })
}

function extractDelta(payload: unknown) {
  if (!isRecord(payload)) return ''

  if (typeof payload.response === 'string') return payload.response
  if (payload.error !== undefined) {
    throw new Error('Cloudflare Workers AI returned an error while generating a response.')
  }

  const choices = payload.choices
  if (!Array.isArray(choices) || !isRecord(choices[0])) return ''
  const delta = choices[0].delta
  if (!isRecord(delta)) return ''
  if (typeof delta.content === 'string') return delta.content
  if (Array.isArray(delta.content)) {
    return delta.content
      .filter((part): part is Record<string, unknown> => isRecord(part) && part.type === 'text')
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('')
  }
  return ''
}

async function pumpCloudflareStream(
  body: ReadableStream<Uint8Array>,
  writer: UIMessageStreamWriter,
  signal: AbortSignal,
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const textId = crypto.randomUUID()
  let buffer = ''
  let emittedText = false

  writer.write({ type: 'start' })
  writer.write({ type: 'text-start', id: textId })

  const consumeEvent = (event: string) => {
    for (const line of event.split('\n')) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      let payload: unknown
      try {
        payload = JSON.parse(data)
      } catch {
        throw new Error('The model stream returned an invalid event.')
      }
      const delta = extractDelta(payload)
      if (delta) {
        emittedText = true
        writer.write({ type: 'text-delta', id: textId, delta })
      }
    }
  }

  try {
    while (true) {
      if (signal.aborted) return
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() ?? ''
      for (const event of events) consumeEvent(event)
    }
    buffer += decoder.decode()
    if (buffer.trim()) consumeEvent(buffer)
    if (!emittedText) throw new Error('The model returned an empty response. Please try again.')
    writer.write({ type: 'text-end', id: textId })
  } finally {
    reader.releaseLock()
  }
}

class PayloadTooLargeError extends Error {}

async function readJsonBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error('The chat request body is empty.')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxRequestBytes) {
        await reader.cancel()
        throw new PayloadTooLargeError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new Error('The chat request was not valid JSON.')
  }
}

export async function POST(request: Request) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !apiToken) {
    return Response.json(
      { error: 'Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to enable chat.' },
      { status: 503 },
    )
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > maxRequestBytes) {
    return Response.json({ error: 'Attachments are too large for one request.' }, { status: 413 })
  }

  let body: unknown
  try {
    body = await readJsonBody(request)
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return Response.json({ error: 'Attachments are too large for one request.' }, { status: 413 })
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'The chat request was not valid JSON.' },
      { status: 400 },
    )
  }
  if (!isRecord(body)) {
    return Response.json({ error: 'The chat request is invalid.' }, { status: 400 })
  }

  const model = getModel(body.modelId)
  const mode = body.mode
  const thinkingLevel = body.thinkingLevel
  if (
    !model ||
    (mode !== 'auto' && mode !== 'fast' && mode !== 'thinking') ||
    !supportsMode(model.id, mode) ||
    (thinkingLevel !== 'low' && thinkingLevel !== 'medium' && thinkingLevel !== 'maximum')
  ) {
    return Response.json({ error: 'The selected model configuration is not supported.' }, { status: 400 })
  }

  let messages: CloudflareMessage[]
  try {
    messages = toCloudflareMessages(body.messages)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The chat contains an invalid attachment.'
    return Response.json({ error: message }, { status: 400 })
  }

  const upstreamUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/v1/chat/completions`
  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.id,
        messages,
        stream: true,
        ...buildModelParameters(
          model.id,
          mode,
          thinkingLevel,
        ),
      }),
      signal: request.signal,
    })
  } catch {
    return Response.json(
      { error: 'Could not connect to Cloudflare Workers AI. Check the server configuration and try again.' },
      { status: 502 },
    )
  }

  if (!upstream.ok || !upstream.body) {
    return Response.json(
      {
        error:
          upstream.status === 401 || upstream.status === 403
            ? 'Cloudflare rejected the API credentials. Check the account ID and API token.'
            : `Cloudflare Workers AI could not start this response (HTTP ${upstream.status}).`,
      },
      { status: upstream.status === 401 || upstream.status === 403 ? 502 : 503 },
    )
  }

  const stream = createUIMessageStream<UIMessage>({
    execute: async ({ writer }) => {
      await pumpCloudflareStream(upstream.body!, writer, request.signal)
    },
    onError: () => 'The model stream ended unexpectedly. Please try again.',
  })

  return createUIMessageStreamResponse({
    stream,
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
