
import Head from 'next/head'
import { useEffect, useRef, useState } from 'react'

const MAX_FILES = 5
const MAX_FILE_SIZE = 200 * 1024
const MAX_TOTAL_TEXT = 12000

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'js', 'jsx', 'ts', 'tsx', 'py', 'html',
  'css', 'xml', 'yaml', 'yml', 'log', 'sql', 'sh', 'toml', 'ini', 'c',
  'cpp', 'h', 'hpp', 'java', 'go', 'rs', 'php', 'rb', 'swift', 'kt',
])

const THEMES = {
  light: {
    page: '#FFFFFF',
    text: '#262626',
    muted: '#777777',
    border: '#E5E5E5',
    bubble: '#F4F4F4',
    composer: '#FFFFFF',
    send: '#252525',
    sendText: '#FFFFFF',
  },
  dark: {
    page: '#212121',
    text: '#F4F4F4',
    muted: '#AAAAAA',
    border: '#454545',
    bubble: '#303030',
    composer: '#303030',
    send: '#F4F4F4',
    sendText: '#212121',
  },
}

function isSupportedTextFile(file) {
  const extension = file.name.split('.').pop().toLowerCase()

  return (
    TEXT_EXTENSIONS.has(extension) ||
    (file.type || '').startsWith('text/')
  )
}

function SendIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 19V5M6 11l6-6 6 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ThemeIcon({ dark }) {
  if (dark) {
    return (
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="4"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20.3 15.1A8.6 8.6 0 0 1 8.9 3.7 8.7 8.7 0 1 0 20.3 15.1Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function Home() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [darkMode, setDarkMode] = useState(false)

  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)

  const theme = darkMode ? THEMES.dark : THEMES.light
  const canSend =
    !loading && (input.trim().length > 0 || attachments.length > 0)

  // Restore the selected theme when the page opens.
  useEffect(() => {
    try {
      setDarkMode(
        window.localStorage.getItem('radium-theme') === 'dark'
      )
    } catch {
      // Use light mode if browser storage is unavailable.
    }
  }, [])

  // Keep the newest message visible.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    })
  }, [messages, loading])

  useEffect(() => {
    if (!notice) return undefined

    const timer = window.setTimeout(() => setNotice(''), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  function toggleTheme() {
    setDarkMode((current) => {
      const next = !current

      try {
        window.localStorage.setItem(
          'radium-theme',
          next ? 'dark' : 'light'
        )
      } catch {
        // The theme still changes for the current session.
      }

      return next
    })
  }

  async function handleFilesSelected(event) {
    const selected = Array.from(event.target.files || [])
    event.target.value = ''

    if (!selected.length) return

    let totalCharacters = attachments.reduce(
      (total, file) => total + file.content.length,
      0
    )

    let slots = MAX_FILES - attachments.length
    const accepted = []
    const rejected = []

    for (const file of selected) {
      if (slots <= 0) {
        rejected.push(
          `${file.name}: you can attach up to ${MAX_FILES} files`
        )
        continue
      }

      if (!isSupportedTextFile(file)) {
        rejected.push(
          `${file.name}: this file type is not supported yet`
        )
        continue
      }

      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name}: file must be 200 KB or smaller`)
        continue
      }

      const remaining = MAX_TOTAL_TEXT - totalCharacters

      if (remaining <= 0) {
        rejected.push(
          `${file.name}: the combined text limit has been reached`
        )
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
        slots -= 1
      } catch {
        rejected.push(`${file.name}: couldn't read this file`)
      }
    }

    if (accepted.length) {
      setAttachments((current) => [...current, ...accepted])
    }

    if (rejected.length) {
      setNotice(`Some files weren't added: ${rejected.join('; ')}`)
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
    const displayContent =
      prompt || 'Please review the attached files.'

    const fileContents = filesToSend
      .map((file) => {
        const note = file.truncated
          ? '\n[File content was shortened to fit the attachment limit.]'
          : ''

        return `--- File: ${file.name} ---\n${file.content}${note}`
      })
      .join('\n\n')

    const content = fileContents
      ? `${displayContent}\n\nAttached file contents:\n\n${fileContents}`
      : displayContent

    const nextMessages = [
      ...messages,
      {
        role: 'user',
        content,
        displayContent,
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
          messages: nextMessages.map(
            ({ role, content: messageContent }) => ({
              role,
              content: messageContent,
            })
          ),
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
        { role: 'assistant', content: reply },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          isError: true,
          content:
            `I couldn't connect to Ollama Cloud.\n\n${error.message}\n\n` +
            'Check your /api/chat backend and the environment variables in Vercel.',
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

  const iconButton = {
    border: 'none',
    background: 'transparent',
    color: theme.text,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 6,
    fontFamily: 'inherit',
  }

  return (
    <>
      <Head>
        <title>Radium</title>
        <meta name="application-name" content="Radium" />
        <meta name="theme-color" content={theme.page} />

        <link
          key="radium-favicon"
          rel="icon"
          type="image/png"
          href={
            darkMode
              ? '/radium-logo-dark.png'
              : '/radium-logo.png'
          }
        />
      </Head>

      <main
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100dvh',
          minHeight: 400,
          overflow: 'hidden',
          background: theme.page,
          color: theme.text,
          fontFamily: 'Arial, Helvetica, sans-serif',
          transition: 'background 160ms ease, color 160ms ease',
        }}
      >
        {/* Theme toggle, without a button border or circle. */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={
            darkMode ? 'Switch to light mode' : 'Switch to dark mode'
          }
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            ...iconButton,
            position: 'absolute',
            top: 14,
            right: 18,
            zIndex: 2,
            gap: 8,
            fontSize: 12,
            color: theme.muted,
          }}
        >
          <ThemeIcon dark={darkMode} />
          <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>
        </button>

        {/* Conversation */}
        <section
          aria-label="Conversation"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '24px 20px',
          }}
        >
          <div
            style={{
              maxWidth: 768,
              width: '100%',
              minHeight: '100%',
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {messages.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '30px 12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 13,
                  }}
                >
                  <img
                    src={
                      darkMode
                        ? '/radium-logo-dark.png'
                        : '/radium-logo.png'
                    }
                    alt=""
                    width="48"
                    height="48"
                    style={{
                      display: 'block',
                      width: 48,
                      height: 48,
                      objectFit: 'contain',
                    }}
                  />

                  <h1
                    style={{
                      margin: 0,
                      fontSize: 'clamp(34px, 5vw, 43px)',
                      lineHeight: 1.15,
                      letterSpacing: '-1.8px',
                      fontWeight: 600,
                      color: theme.text,
                    }}
                  >
                    Radium
                  </h1>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message, index) => (
                  <div
                    key={`${index}-${message.role}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems:
                        message.role === 'user' ? 'flex-end' : 'flex-start',
                      width: '100%',
                      marginBottom: 28,
                    }}
                  >
                    {message.role === 'user' ? (
                      <div
                        style={{
                          maxWidth: '85%',
                          background: theme.bubble,
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
                              <span
                                key={name}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '5px 9px',
                                  border: `1px solid ${theme.border}`,
                                  borderRadius: 8,
                                  background: theme.page,
                                  fontSize: 12,
                                  overflowWrap: 'anywhere',
                                }}
                              >
                                ▤ {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          maxWidth: '100%',
                          fontSize: 15,
                          lineHeight: 1.85,
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                          color: message.isError ? '#E05B55' : theme.text,
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
                      color: theme.muted,
                    }}
                  >
                    Radium is thinking…
                  </div>
                )}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </section>

        {/* Composer */}
        <footer
          style={{
            flexShrink: 0,
            width: '100%',
            padding: '12px 18px 22px',
            background: theme.page,
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
                border: `1px solid ${theme.border}`,
                borderRadius: 26,
                background: theme.composer,
                padding: '13px 14px 10px 17px',
                boxShadow: darkMode
                  ? 'none'
                  : '0 2px 8px rgba(0,0,0,0.04)',
                boxSizing: 'border-box',
                transition: 'background 160ms ease, border-color 160ms ease',
              }}
            >
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
                        border: `1px solid ${theme.border}`,
                        borderRadius: 10,
                        padding: '8px 10px',
                        fontSize: 12,
                        background: theme.bubble,
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
                        onClick={() => removeAttachment(file.id)}
                        style={{
                          ...iconButton,
                          padding: 0,
                          fontSize: 18,
                          color: theme.muted,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value)
                  event.target.style.height = 'auto'
                  event.target.style.height =
                    `${Math.min(event.target.scrollHeight, 180)}px`
                }}
                onKeyDown={handleKeyDown}
                placeholder="Message Radium"
                aria-label="Message Radium"
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
                  color: theme.text,
                  fontFamily: 'inherit',
                  fontSize: 16,
                  lineHeight: 1.6,
                  padding: '5px 0 9px',
                  boxSizing: 'border-box',
                }}
              />

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
                    gap: 9,
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={[
                      ...Array.from(TEXT_EXTENSIONS).map(
                        (extension) => `.${extension}`
                      ),
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
                    aria-label="Add files"
                    title="Add files"
                    style={{
                      ...iconButton,
                      width: 32,
                      height: 32,
                      padding: 0,
                      fontSize: 27,
                      fontWeight: 300,
                      opacity:
                        loading || attachments.length >= MAX_FILES
                          ? 0.45
                          : 1,
                      cursor:
                        loading || attachments.length >= MAX_FILES
                          ? 'not-allowed'
                          : 'pointer',
                    }}
                  >
                    +
                  </button>

                  <span
                    style={{
                      fontSize: 12,
                      color: theme.muted,
                    }}
                  >
                    Add files
                  </span>
                </div>

                {/* Rounded-square send button, not circular. */}
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={!canSend}
                  aria-label="Send message"
                  title="Send message"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    flexShrink: 0,
                    padding: 0,
                    border: 'none',
                    borderRadius: 10,
                    background: canSend ? theme.send : theme.border,
                    color: canSend ? theme.sendText : theme.muted,
                    cursor: canSend ? 'pointer' : 'not-allowed',
                    transition: 'background 150ms ease, color 150ms ease',
                  }}
                >
                  <SendIcon />
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
                  color: '#E05B55',
                  overflowWrap: 'anywhere',
                }}
              >
                {notice}
              </div>
            )}
          </div>
        </footer>
      </main>
    </>
  )
}
