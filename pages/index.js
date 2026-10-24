
import Head from 'next/head'
import { useEffect, useRef, useState } from 'react'

const MAX_FILES = 5
const MAX_TEXT_FILE_BYTES = 200 * 1024
const MAX_IMAGE_FILE_BYTES = 1.5 * 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_TEXT = 12000
const MAX_HISTORY_MESSAGES = 30

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'js', 'jsx', 'ts', 'tsx',
  'py', 'html', 'css', 'xml', 'yaml', 'yml', 'log',
  'sql', 'sh', 'toml', 'ini', 'c', 'cpp', 'h', 'hpp',
  'java', 'go', 'rs', 'php', 'rb', 'swift', 'kt',
])

const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
])

const THEMES = {
  light: {
    page: '#FFFFFF',
    text: '#262626',
    muted: '#777777',
    border: '#E5E5E5',
    bubble: '#F4F4F4',
    composer: '#FFFFFF',
    disabled: '#AAAAAA',
  },
  dark: {
    page: '#212121',
    text: '#F4F4F4',
    muted: '#AAAAAA',
    border: '#454545',
    bubble: '#303030',
    composer: '#303030',
    disabled: '#777777',
  },
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read file'))

    reader.readAsDataURL(file)
  })
}

function isSupportedTextFile(file) {
  const extension = file.name.split('.').pop().toLowerCase()

  return (
    TEXT_EXTENSIONS.has(extension) ||
    (file.type || '').startsWith('text/')
  )
}

function SendTriangle({ color }) {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 4 L19.15 16.38 L4.85 16.38 Z"
        stroke={color}
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Home() {
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

  // Follow the operating system's appearance setting automatically.
  // There is no manual theme switch.
  useEffect(() => {
    const preference = window.matchMedia(
      '(prefers-color-scheme: dark)'
    )

    const updateTheme = (event) => setDarkMode(event.matches)

    setDarkMode(preference.matches)

    if (preference.addEventListener) {
      preference.addEventListener('change', updateTheme)
      return () => preference.removeEventListener('change', updateTheme)
    }

    // Compatibility with older browsers.
    preference.addListener(updateTheme)
    return () => preference.removeListener(updateTheme)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    })
  }, [messages, loading])

  useEffect(() => {
    if (!notice) return undefined

    const timer = window.setTimeout(() => setNotice(''), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function handleFilesSelected(event) {
    const selected = Array.from(event.target.files || [])
    event.target.value = ''

    if (!selected.length) return

    const accepted = []
    const rejected = []

    let slots = MAX_FILES - attachments.length
    let totalImageBytes = attachments
      .filter((file) => file.kind === 'image')
      .reduce((sum, file) => sum + file.size, 0)

    let totalTextCharacters = attachments
      .filter((file) => file.kind === 'text')
      .reduce((sum, file) => sum + file.content.length, 0)

    for (const file of selected) {
      if (slots <= 0) {
        rejected.push(`Maximum ${MAX_FILES} attachments allowed`)
        break
      }

      if ((file.type || '').startsWith('image/')) {
        if (!IMAGE_TYPES.has(file.type)) {
          rejected.push(`${file.name}: use PNG, JPEG, or WebP images`)
          continue
        }

        if (file.size > MAX_IMAGE_FILE_BYTES) {
          rejected.push(`${file.name}: image must be 1.5 MB or smaller`)
          continue
        }

        if (totalImageBytes + file.size > MAX_TOTAL_IMAGE_BYTES) {
          rejected.push('Combined image size cannot exceed 2 MB')
          continue
        }

        try {
          const dataUrl = await readAsDataURL(file)
          const base64 = dataUrl.split(',')[1]

          if (!base64) {
            rejected.push(`${file.name}: invalid image data`)
            continue
          }

          accepted.push({
            id: `${Date.now()}-${accepted.length}-${file.name}`,
            name: file.name,
            kind: 'image',
            mime: file.type,
            size: file.size,
            base64,
            dataUrl,
          })

          totalImageBytes += file.size
          slots -= 1
        } catch {
          rejected.push(`${file.name}: could not read image`)
        }

        continue
      }

      if (!isSupportedTextFile(file)) {
        rejected.push(`${file.name}: unsupported file type`)
        continue
      }

      if (file.size > MAX_TEXT_FILE_BYTES) {
        rejected.push(`${file.name}: file must be 200 KB or smaller`)
        continue
      }

      const remaining = MAX_TOTAL_TEXT - totalTextCharacters

      if (remaining <= 0) {
        rejected.push('Combined text attachment limit reached')
        continue
      }

      try {
        const originalText = await file.text()
        const content = originalText.slice(0, remaining)

        accepted.push({
          id: `${Date.now()}-${accepted.length}-${file.name}`,
          name: file.name,
          kind: 'text',
          size: file.size,
          content,
          truncated: originalText.length > content.length,
        })

        totalTextCharacters += content.length
        slots -= 1
      } catch {
        rejected.push(`${file.name}: could not read file`)
      }
    }

    if (accepted.length) {
      setAttachments((current) => [...current, ...accepted])
    }

    if (rejected.length) {
      setNotice(rejected.join(' · '))
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
    const imageFiles = filesToSend.filter(
      (file) => file.kind === 'image'
    )
    const textFiles = filesToSend.filter(
      (file) => file.kind === 'text'
    )

    const displayContent =
      prompt ||
      (imageFiles.length
        ? 'Please analyze the attached image(s).'
        : 'Please review the attached file(s).')

    const fileContents = textFiles
      .map((file) => {
        const note = file.truncated
          ? '\n[File content shortened to fit the attachment limit.]'
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
        images: imageFiles.map((file) => ({
          name: file.name,
          mime: file.mime,
          base64: file.base64,
        })),
        displayAttachments: filesToSend.map((file) => ({
          id: file.id,
          name: file.name,
          kind: file.kind,
          mime: file.mime,
          dataUrl: file.dataUrl,
        })),
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
      // Send only the latest image-bearing message's images.
      // Earlier text messages remain available as conversation context.
      const history = nextMessages.slice(-MAX_HISTORY_MESSAGES)

      let lastImageIndex = -1

      history.forEach((message, index) => {
        if (message.role === 'user' && message.images?.length) {
          lastImageIndex = index
        }
      })

      const apiMessages = history.map((message, index) => {
        const apiMessage = {
          role: message.role,
          content: message.content.slice(0, 8000),
        }

        if (index === lastImageIndex) {
          apiMessage.images = message.images.map(
            (image) => image.base64
          )
        }

        return apiMessage
      })

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: apiMessages }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          data.error || `Request failed (${response.status})`
        )
      }

      const reply =
        data.reply ||
        data.message?.content ||
        data.output_text

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
            `I couldn't get a response from Ollama Cloud.\n\n${error.message}\n\n` +
            'Check your API key, model name, and /api/chat backend.',
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

  const iconButtonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    border: 'none',
    borderRadius: 0,
    background: 'transparent',
    color: theme.text,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'color 300ms cubic-bezier(.22,1,.36,1), opacity 250ms ease',
  }

  return (
    <>
      <Head>
        <title>Radium</title>
        <meta name="application-name" content="Radium" />
        <meta name="theme-color" content={theme.page} />

        <link
          key={darkMode ? 'radium-dark-favicon' : 'radium-light-favicon'}
          rel="icon"
          type="image/png"
          href={
            darkMode
              ? '/radium-logo-dark.png'
              : '/radium-logo.png'
          }
        />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Head>

      <style jsx global>{`
        html,
        body,
        #__next {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
        }

        * {
          box-sizing: border-box;
        }

        html {
          scroll-behavior: smooth;
        }

        textarea,
        button {
          font: inherit;
        }

        button:focus-visible,
        textarea:focus-visible {
          outline: 2px solid currentColor;
          outline-offset: 3px;
        }

        .radium-message {
          animation: radium-appear 420ms cubic-bezier(.22, 1, .36, 1) both;
        }

        .radium-preview {
          animation: radium-appear 360ms cubic-bezier(.22, 1, .36, 1) both;
          transition: opacity 250ms ease, transform 350ms cubic-bezier(.22, 1, .36, 1);
        }

        @keyframes radium-appear {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: .01ms !important;
          }
        }
      `}</style>

      <main
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100dvh',
          minHeight: 400,
          overflow: 'hidden',
          background: theme.page,
          color: theme.text,
          fontFamily: 'Roboto, Arial, sans-serif',
          transition: 'background-color 420ms cubic-bezier(.22,1,.36,1), color 420ms cubic-bezier(.22,1,.36,1)',
        }}
      >
        <section
          aria-label="Conversation"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '24px 20px',
            overscrollBehavior: 'contain',
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
                  animation: 'radium-appear 650ms cubic-bezier(.22,1,.36,1) both',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 13,
                    maxWidth: '100%',
                  }}
                >
                  <img
                    src={
                      darkMode
                        ? '/radium-logo-dark.png'
                        : '/radium-logo.png'
                    }
                    alt="Radium logo"
                    width="96"
                    height="96"
                    style={{
                      display: 'block',
                      width: 96,
                      height: 96,
                      objectFit: 'contain',
                      flexShrink: 0,
                      transition: 'opacity 350ms ease',
                    }}
                  />

                  <h1
                    style={{
                      margin: 0,
                      fontFamily: 'Roboto, Arial, sans-serif',
                      fontSize: 'clamp(34px, 5vw, 43px)',
                      lineHeight: 1.15,
                      letterSpacing: '-1.2px',
                      fontWeight: 400,
                      color: theme.text,
                      transition: 'color 420ms cubic-bezier(.22,1,.36,1)',
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
                    className="radium-message"
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
                          maxWidth: '90%',
                          background: theme.bubble,
                          borderRadius: 22,
                          padding: '12px 17px',
                          fontSize: 15,
                          lineHeight: 1.7,
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                          transition: 'background-color 420ms cubic-bezier(.22,1,.36,1)',
                        }}
                      >
                        {message.displayContent || message.content}

                        {message.displayAttachments?.length > 0 && (
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 8,
                              marginTop: 12,
                            }}
                          >
                            {message.displayAttachments.map((file) => (
                              <div
                                key={file.id}
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 5,
                                  maxWidth: 160,
                                  fontSize: 12,
                                  color: theme.muted,
                                }}
                              >
                                {file.kind === 'image' ? (
                                  <img
                                    className="radium-preview"
                                    src={file.dataUrl}
                                    alt={file.name}
                                    style={{
                                      display: 'block',
                                      width: 144,
                                      height: 112,
                                      objectFit: 'cover',
                                      borderRadius: 12,
                                      border: `1px solid ${theme.border}`,
                                    }}
                                  />
                                ) : (
                                  <span
                                    style={{
                                      padding: '10px 12px',
                                      border: `1px solid ${theme.border}`,
                                      borderRadius: 10,
                                      overflowWrap: 'anywhere',
                                    }}
                                  >
                                    ▤ {file.name}
                                  </span>
                                )}

                                <span
                                  style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {file.name}
                                </span>
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
                    className="radium-message"
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
            transition: 'background-color 420ms cubic-bezier(.22,1,.36,1)',
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
                padding: '13px 15px 10px 17px',
                boxShadow: darkMode
                  ? '0 2px 12px rgba(0,0,0,.08)'
                  : '0 2px 10px rgba(0,0,0,.045)',
                transition: 'background-color 420ms cubic-bezier(.22,1,.36,1), border-color 420ms cubic-bezier(.22,1,.36,1), box-shadow 420ms ease',
              }}
            >
              {attachments.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    paddingBottom: 12,
                  }}
                >
                  {attachments.map((file) => (
                    <div
                      key={file.id}
                      className="radium-preview"
                      style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 5,
                        maxWidth: 112,
                        fontSize: 11,
                        color: theme.muted,
                      }}
                    >
                      {file.kind === 'image' ? (
                        <img
                          src={file.dataUrl}
                          alt={file.name}
                          style={{
                            display: 'block',
                            width: 88,
                            height: 76,
                            objectFit: 'cover',
                            borderRadius: 11,
                            border: `1px solid ${theme.border}`,
                          }}
                        />
                      ) : (
                        <div
                          title={file.name}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 88,
                            height: 76,
                            padding: 8,
                            borderRadius: 11,
                            border: `1px solid ${theme.border}`,
                            overflowWrap: 'anywhere',
                            textAlign: 'center',
                          }}
                        >
                          {file.name}
                        </div>
                      )}

                      <span
                        title={file.name}
                        style={{
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
                          position: 'absolute',
                          top: -7,
                          right: -7,
                          width: 22,
                          height: 22,
                          border: `1px solid ${theme.border}`,
                          borderRadius: '50%',
                          background: theme.composer,
                          color: theme.text,
                          cursor: 'pointer',
                          lineHeight: 1,
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
                placeholder="Type here"
                aria-label="Type here"
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
                  fontFamily: 'Roboto, Arial, sans-serif',
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
                  justifyContent: 'flex-end',
                  gap: 14,
                  paddingTop: 2,
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={[
                    'image/png',
                    'image/jpeg',
                    'image/webp',
                    ...Array.from(TEXT_EXTENSIONS).map(
                      (extension) => `.${extension}`
                    ),
                    'text/*',
                  ].join(',')}
                  onChange={handleFilesSelected}
                  style={{ display: 'none' }}
                />

                {/* Plain plus sign, positioned next to Send. */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || attachments.length >= MAX_FILES}
                  aria-label="Attach files or images"
                  title="Attach files or images"
                  style={{
                    ...iconButtonStyle,
                    width: 36,
                    height: 36,
                    fontSize: 29,
                    fontWeight: 300,
                    lineHeight: 1,
                    opacity:
                      loading || attachments.length >= MAX_FILES ? 0.4 : 1,
                    cursor:
                      loading || attachments.length >= MAX_FILES
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  +
                </button>

                {/* Outlined equilateral triangle; no circular background. */}
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={!canSend}
                  aria-label="Send message"
                  title="Send message"
                  style={{
                    ...iconButtonStyle,
                    width: 36,
                    height: 36,
                    opacity: canSend ? 1 : 0.45,
                    cursor: canSend ? 'pointer' : 'not-allowed',
                  }}
                >
                  <SendTriangle color={theme.text} />
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

export default Home
