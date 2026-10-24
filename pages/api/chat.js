
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
}

const MAX_MESSAGES = 12
const MAX_MESSAGE_CHARS = 5000
const MAX_IMAGES = 5
const MAX_BASE64_CHARS = 3_600_000

function isBase64(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({
      error: 'Method not allowed. Use POST.',
    })
  }

  const apiKey = process.env.OLLAMA_API_KEY
  const model = process.env.OLLAMA_MODEL || 'gemma4:cloud'

  if (!apiKey) {
    return res.status(500).json({
      error: 'OLLAMA_API_KEY is not configured in the server environment.',
    })
  }

  const incoming = req.body?.messages

  if (!Array.isArray(incoming) || incoming.length === 0) {
    return res.status(400).json({
      error: 'No chat messages were provided.',
    })
  }

  const messages = incoming
    .filter(
      (message) =>
        message &&
        ['user', 'assistant'].includes(message.role) &&
        typeof message.content === 'string'
    )
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, MAX_MESSAGE_CHARS),
      images:
        message.role === 'user' && Array.isArray(message.images)
          ? message.images
          : [],
    }))

  if (!messages.length) {
    return res.status(400).json({
      error: 'No valid chat messages were provided.',
    })
  }

  let totalImageCharacters = 0

  for (const message of messages) {
    if (!message.images.length) continue

    if (message.images.length > MAX_IMAGES) {
      return res.status(400).json({
        error: `You can attach up to ${MAX_IMAGES} images in one message.`,
      })
    }

    for (const image of message.images) {
      if (!isBase64(image)) {
        return res.status(400).json({
          error: 'An image was not encoded correctly. Please attach it again.',
        })
      }

      totalImageCharacters += image.length
    }
  }

  if (totalImageCharacters > MAX_BASE64_CHARS) {
    return res.status(413).json({
      error: 'The compressed images are too large for one request. Remove an image and try again.',
    })
  }

  const ollamaMessages = messages.map((message) => {
    const result = {
      role: message.role,
      content: message.content,
    }

    if (message.images.length) {
      result.images = message.images
    }

    return result
  })

  try {
    const response = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: ollamaMessages,
        stream: false,
      }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      console.error(
        'Ollama Cloud error:',
        response.status,
        data.error || 'Unknown error'
      )

      return res.status(502).json({
        error:
          data.error ||
          `Ollama Cloud returned HTTP ${response.status}.`,
      })
    }

    const reply = data.message?.content

    if (typeof reply !== 'string' || !reply.trim()) {
      return res.status(502).json({
        error: 'Ollama Cloud returned an empty response.',
      })
    }

    return res.status(200).json({ reply })
  } catch (error) {
    console.error('Ollama Cloud connection error:', error)

    return res.status(502).json({
      error: 'Could not connect to Ollama Cloud. Please try again.',
    })
  }
}
