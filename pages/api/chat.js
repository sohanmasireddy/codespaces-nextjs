
const MAX_MESSAGES = 40
const MAX_MESSAGE_LENGTH = 20000

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.OLLAMA_API_KEY

  if (!apiKey) {
    return res.status(500).json({
      error: 'OLLAMA_API_KEY is not configured on the server.',
    })
  }

  try {
    const { messages } = req.body || {}

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: 'Please provide a conversation.',
      })
    }

    const chatMessages = messages
      .filter(
        (message) =>
          message &&
          ['user', 'assistant'].includes(message.role) &&
          typeof message.content === 'string'
      )
      .slice(-MAX_MESSAGES)
      .map((message) => ({
        role: message.role,
        content: message.content.slice(0, MAX_MESSAGE_LENGTH),
      }))

    if (!chatMessages.length) {
      return res.status(400).json({
        error: 'No valid messages were provided.',
      })
    }

    const ollamaResponse = await fetch('https://ollama.com/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'gemma4:cloud',
        messages: chatMessages,
        stream: false,
      }),
    })

    const responseData = await ollamaResponse.json()

    if (!ollamaResponse.ok) {
      console.error(
        'Ollama API error:',
        responseData.error || ollamaResponse.status
      )

      return res.status(502).json({
        error: responseData.error || 'Ollama Cloud request failed.',
      })
    }

    const reply = responseData.message?.content

    if (typeof reply !== 'string' || !reply.trim()) {
      return res.status(502).json({
        error: 'Ollama returned an empty response.',
      })
    }

    return res.status(200).json({ reply })
  } catch (error) {
    console.error('Chat backend error:', error)

    return res.status(500).json({
      error: 'Unable to connect to Ollama Cloud.',
    })
  }
}
