
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
}

const MAX_MESSAGES = 30
const MAX_MESSAGE_CHARS = 8000
const MAX_IMAGES_PER_MESSAGE = 5
const MAX_TOTAL_IMAGE_BASE64_CHARS = 2_850_000

function isValidBase64(value) {
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
      error: 'OLLAMA_API_KEY is missing from the server environment.',
    })
  }

  const incomingMessages = req.body?.messages

  if (!Array.isArray(incomingMessages) || incomingMessages.length === 0) {
    return res.status(400).json({
      error: 'Send at least one chat message.',
    })
  }

  const messages = incomingMessages
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

  if (messages.length === 0) {
    return res.status(400).json({
      error: 'No valid chat messages were provided.',
    })
  }

  // Only send images from the most recent image-bearing message.
  // This keeps follow-up questions grounded without resending every image.
  let lastImageIndex = -1

  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i].images.length > 0) {
      lastImageIndex = i
    }
  }

  let totalImageCharacters = 0

  if (lastImageIndex !== -1) {
    const images = messages[lastImageIndex].images

    if (images.length > MAX_IMAGES_PER_MESSAGE) {
      return res.status(400).json({
        error: `You can send at most ${MAX_IMAGES_PER_MESSAGE} images at once.`,
      })
    }

    for (const image of images) {
      if (!isValidBase64(image)) {
        return res.status(400).json({
          error: 'An image was not encoded correctly. Try attaching it again.',
        })
      }

      totalImageCharacters += image.length
    }

    if (totalImageCharacters > MAX_TOTAL_IMAGE_BASE64_CHARS) {
      return res.status(413).json({
        error: 'The images are too large. Please use smaller images.',
      })
    }
  }

  const ollamaMessages = messages.map((message, index) => {
    const result = {
      role: message.role,
      content: message.content,
    }

    if (index === lastImageIndex) {
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
        'Ollama Cloud request failed:',
        response.status,
        data.error || 'Unknown API error'
      )

      return res.status(502).json({
        error:
          data.error ||
          `Ollama Cloud returned HTTP ${response.status}. Check your model and API access.`,
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
      error:
        'Could not reach Ollama Cloud. Check the network and try again.',
    })
  }
}
