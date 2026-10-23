
import { useEffect, useRef, useState } from 'react'

const COLORS = {
  background: '#FFFFFF',
  text: '#262626',
  muted: '#777777',
  border: '#E5E5E5',
  userBubble: '#F4F4F4',
  button: '#292929',
}

const MAX_FILES = 5
const MAX_FILE_SIZE = 200 * 1024
const MAX_TOTAL_TEXT = 12000

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'js', 'jsx', 'ts', 'tsx',
  'py', 'html', 'css', 'xml', 'yaml', 'yml', 'log',
  'sql', 'sh', 'toml', 'ini', 'c', 'cpp', 'h', 'hpp',
  'java', 'go', 'rs', 'php', 'rb', 'swift', 'kt',
])

function isSupportedTextFile(file) {
  const extension = file.name.split('.').pop().toLowerCase()
  return TEXT_EXTENSIONS.has(extension) || file.type.startsWith('text/')
}

function Home() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    })
  }, [messages, loading])

  useEffect(() => {
    if (!notice) return

    const timeout = setTimeout(() => setNotice(''), 4000)
    return () => clearTimeout(timeout)
  }, [notice])

  async function handleFilesSelected(event) {
    const selected = Array.from(event.target.files || [])
    event.target.value = ''

    if (!selected.length) return

    let totalCharacters = attachments.reduce(
      (total, file) => total + file.content.length,
      0
    )

    let availableSlots = MAX_FILES - attachments.length
    const accepted = []
    const rejected = []

    for (const file of selected) {
      if (availableSlots <= 0) {
        rejected.push(`${file.name}: maximum ${MAX_FILES} files`)
        continue
      }

      if (!isSupportedTextFile(file)) {
        rejected.push(`${file.name}: unsupported file type`)
        continue
      }

      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name}: file exceeds 200 KB`)
        continue
      }

      const remaining = MAX_TOTAL_TEXT - totalCharacters

      if (remaining <= 0) {
        rejected.push(`${file.name}: attachment text limit reached`)
        continue
      }

      try {
        const originalText = await file.text()
        const content = originalText.slice(0, remaining)

        accepted.push({
          id: `${Date.now()}-${accepted.length}-${file.name}`,
          name: file.name,
          content,
          truncated: originalText.length > content.length,
        })

        totalCharacters += content.length
        availableSlots -= 1
      } catch {
        rejected.push(`${file.name}: could not read file`)
      }
    }

    if (accepted.length) {
      setAttachments((current) => [...current, ...accepted])
    }

    if (rejected.length) {
      setNotice(
        `Some files were not added: ${rejected.join('; ')}`
      )
    }
  }

  function removeAttachment(id) {
    setAttachments((current) =>
      current.filter((file) => file.id !== id)
    )
  }

  async function sendMessage() {
    const prompt = input.trim()

    if ((!prompt && attachments.length === 0) || loading) return

    const filesToSend = [...attachments]
    const visibleText = prompt || 'Please review the attached files.'

    const fileContents = filesToSend
      .map((file) => {
        const truncatedNote = file.truncated
          ? '\n[File content truncated because of the size limit.]'
          : ''

        return (
          `--- File: ${file.name} ---\n` +
          file.content +
          truncatedNote
        )
      })
      .join('\n\n')

    const apiContent = fileContents
      ? `${visibleText}\n\nAttached file contents:\n\n${fileContents}`
      : visibleText

    const nextMessages = [
      ...messages,
      {
        role: 'user',
        content: apiContent,
        displayContent: visibleText,
        files: filesToSend.map((file) => file.name),
      },
    ]

    setMessages(nextMessages)
    setInput('')
    setAttachments([])
    setLoading(true)
    setNotice('')

    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          data.error || `Request failed (${response.status})`
        )
      }

      const reply =
        data.reply ||
        data.output_text ||
        data.message?.content ||
        data.message

      if (typeof reply !== 'string' || !reply.trim()) {
        throw new Error('The AI returned an empty response.')
      }

      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: reply,
        },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content:
            `I couldn't connect to Ollama Cloud.\n\n${error.message}\n\n` +
            'Check your backend at /api/chat and your Vercel environment variables.',
          isError: true,
        },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(event) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      sendMessage()
    }
  }

  const buttonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 999,
    background: '#FFFFFF',
    color: COLORS.text,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13,
  }

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100dvh',
        minHeight: 400,
        background: COLORS.background,
        color: COLORS.text,
        fontFamily:
          'Arial, Helvetica, -apple-system, BlinkMacSystemFont, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* CHAT WINDOW */}
      <section
        aria-label="Conversation"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '32px 20px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 768,
            width: '100%',
            margin: '0 auto',
          }}
        >
          {messages.map((message, index) => (
            <div
              key={`${index}-${message.role}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems:
                  message.role === 'user'
                    ? 'flex-end'
                    : 'flex-start',
                marginBottom: 28,
                width: '100%',
              }}
            >
              {message.role === 'user' ? (
                <div
                  style={{
                    maxWidth: '85%',
                    background: COLORS.userBubble,
                    borderRadius: 22,
                    padding: '12px 17px',
                    fontSize: 15,
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {message.displayContent || message.content}

                  {message.files?.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        marginTop: 10,
                      }}
                    >
                      {message.files.map((name) => (
                        <div
                          key={name}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '5px 9px',
                            border: '1px solid #DDDDDD',
                            borderRadius: 9,
                            background: '#FFFFFF',
                            fontSize: 12,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          <span aria-hidden="true">▤</span>
                          {name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    padding: '2px 0',
                    fontSize: 15,
                    lineHeight: 1.85,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    color: message.isError ? '#B42318' : COLORS.text,
                  }}
                >
                  {message.content}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div
              role="status"
              style={{
                margin: '8px 0 28px',
                fontSize: 14,
                color: COLORS.muted,
              }}
            >
              Thinking…
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </section>

      {/* PROMPT BOX */}
      <footer
        style={{
          flexShrink: 0,
          width: '100%',
          padding: '12px 18px 22px',
          background: '#FFFFFF',
        }}
      >
        <div
          style={{
            maxWidth: 768,
            width: '100%',
            margin: '0 auto',
          }}
        >
          <div
            style={{
              width: '100%',
              border: '1px solid #D9D9D9',
              borderRadius: 26,
              background: '#FFFFFF',
              padding: '13px 14px 10px 17px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              boxSizing: 'border-box',
            }}
          >
            {/* ATTACHED FILES */}
            {attachments.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  paddingBottom: 10,
                }}
              >
                {attachments.map((file) => (
                  <div
                    key={file.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      maxWidth: '100%',
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 12,
                      padding: '8px 10px',
                      fontSize: 12,
                      background: '#FAFAFA',
                    }}
                  >
                    <span aria-hidden="true">▤</span>

                    <span
                      title={file.name}
                      style={{
                        maxWidth: 180,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {file.name}
                    </span>

                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      title="Remove file"
                      onClick={() => removeAttachment(file.id)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: COLORS.muted,
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: 17,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* MESSAGE INPUT */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                event.target.style.height = 'auto'
                event.target.style.height =
                  Math.min(event.target.scrollHeight, 180) + 'px'
              }}
              onKeyDown={handleKeyDown}
              placeholder="Message GOD AI"
              aria-label="Message GOD AI"
              rows={1}
              style={{
                display: 'block',
                width: '100%',
                minHeight: 36,
                maxHeight: 180,
                resize: 'none',
                overflowY: 'auto',
                border: 'none',
                outline: 'none',
                boxShadow: 'none',
                background: 'transparent',
                color: COLORS.text,
                fontFamily: 'inherit',
                fontSize: 16,
                lineHeight: 1.6,
                padding: '5px 0 9px',
                boxSizing: 'border-box',
              }}
            />

            {/* ADD FILES + SEND */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={[
                    ...Array.from(TEXT_EXTENSIONS).map((ext) => `.${ext}`),
                    'text/*',
                  ].join(',')}
                  onChange={handleFilesSelected}
                  style={{ display: 'none' }}
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={
                    loading || attachments.length >= MAX_FILES
                  }
                  style={{
                    ...buttonStyle,
                    width: 38,
                    height: 38,
                    fontSize: 23,
                    borderRadius: '50%',
                    opacity:
                      loading || attachments.length >= MAX_FILES
                        ? 0.45
                        : 1,
                    cursor:
                      loading || attachments.length >= MAX_FILES
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                  title="Add files"
                  aria-label="Add files"
                >
                  +
                </button>

                <span
                  style={{
                    fontSize: 12,
                    color: COLORS.muted,
                  }}
                >
                  Add files
                </span>
              </div>

              <button
                type="button"
                onClick={sendMessage}
                disabled={
                  loading ||
                  (!input.trim() && attachments.length === 0)
                }
                aria-label="Send message"
                title="Send message"
                style={{
                  width: 38,
                  height: 38,
                  flexShrink: 0,
                  border: 'none',
                  borderRadius: '50%',
                  background:
                    !loading &&
                    (input.trim() || attachments.length > 0)
                      ? COLORS.button
                      : '#E5E5E5',
                  color:
                    !loading &&
                    (input.trim() || attachments.length > 0)
                      ? '#FFFFFF'
                      : '#999999',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 21,
                  cursor:
                    !loading &&
                    (input.trim() || attachments.length > 0)
                      ? 'pointer'
                      : 'not-allowed',
                }}
              >
                ↑
              </button>
            </div>
          </div>

          {notice && (
            <div
              role="status"
              style={{
                marginTop: 10,
                textAlign: 'center',
                fontSize: 12,
                color: '#B42318',
                overflowWrap: 'anywhere',
              }}
            >
              {notice}
            </div>
          )}
        </div>
      </footer>
    </main>
  )
}

export default Home
