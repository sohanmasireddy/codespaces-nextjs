
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
const MAX_IMAGE_CHARS = 2_800_000

const SYSTEM_PROMPT = `
You are Radium, a helpful and natural conversational AI.

Speak clearly and naturally. Prefer ordinary paragraphs and punctuation.
Avoid unnecessary tables, headings, lists, decorative symbols, and excessive Markdown.
Use code formatting when appropriate or requested.
Follow the user's requested format.
`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Use a POST request.' })
  }

  const apiKey = process.env.OLLAMA_API_KEY
  const model = process.env.OLLAMA_MODEL || 'gemma4:cloud'

  if (!apiKey) {
    console.error('Missing OLLAMA_API_KEY in the server environment.')
    return res.status(500).json({
      error: 'Missing Ollama API key. Add OLLAMA_API_KEY to Vercel Production environment variables, then redeploy.',
    })
  }

  try {
    const incoming = req.body?.messages

    if (!Array.isArray(incoming) || incoming.length === 0) {
      return res.status(400).json({
        error: 'No messages were provided.',
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

    if (messages.length === 0) {
      return res.status(400).json({
        error: 'No valid messages were provided.',
      })
    }

    // Keep only the latest image-bearing message to limit payload size.
    let latestImageIndex = -1

    messages.forEach((message, index) => {
      if (message.images.length > 0) latestImageIndex = index
    })

    let totalImageChars = 0

    for (let i = 0; i < messages.length; i++) {
      const images = messages[i].images

      if (i !== latestImageIndex) {
        messages[i].images = []
        continue
      }

      if (images.length > MAX_IMAGES) {
        return res.status(400).json({
          error: `You can attach up to ${MAX_IMAGES} images per message.`,
        })
      }

      for (const image of images) {
        if (
          typeof image !== 'string' ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(image)
        ) {
          return res.status(400).json({
            error: 'An image has invalid data. Please attach it again.',
          })
        }

        totalImageChars += image.length
      }
    }

    if (totalImageChars > MAX_IMAGE_CHARS) {
      return res.status(413).json({
        error: 'The image request is too large. Try a smaller image.',
      })
    }

    const ollamaMessages = [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      ...messages.map((message) => {
        const result = {
          role: message.role,
          content: message.content,
        }

        if (message.images.length > 0) {
          result.images = message.images
        }

        return result
      }),
    ]

    const response = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: ollamaMessages,
        stream: false,
      }),
    })

    const responseText = await response.text()
    let data = {}

    try {
      data = responseText ? JSON.parse(responseText) : {}
    } catch {
      data = {}
    }

    if (!response.ok) {
      console.error(
        'Ollama Cloud error:',
        response.status,
        data.error || 'No details returned'
      )

      return res.status(502).json({
        error:
          data.error ||
          `Ollama Cloud returned HTTP ${response.status}. Check your API key and model name.`,
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
    console.error('Radium API error:', error)

    return res.status(500).json({
      error: 'The Radium backend failed. Check the Vercel Runtime Logs for the underlying error.',
    })
  }
}
