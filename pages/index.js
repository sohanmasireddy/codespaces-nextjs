
import Head from 'next/head'
import { useEffect, useRef, useState } from 'react'

const MAX_FILES = 5
const MAX_TEXT_FILE_SIZE = 200 * 1024
const MAX_IMAGE_FILE_SIZE = 1.5 * 1024 * 1024
const MAX_TOTAL_IMAGE_SIZE = 2 * 1024 * 1024
const MAX_TOTAL_TEXT = 12000
const MAX_HISTORY = 30
const COMPOSER_MAX_LINES = 2

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

// Keep the prompt compact until its contents wrap.
function resizeComposer(textarea) {
  if (!textarea) return

  textarea.style.height = 'auto'

  const computed = window.getComputedStyle(textarea)
  const lineHeight = parseFloat(computed.lineHeight) || 25.6
  const paddingTop = parseFloat(computed.paddingTop) || 0
  const paddingBottom = parseFloat(computed.paddingBottom) || 0

  const oneLineHeight = Math.ceil(
    lineHeight + paddingTop + paddingBottom
  )

  const maxHeight = Math.ceil(
    lineHeight * COMPOSER_MAX_LINES +
    paddingTop +
    paddingBottom
  )

  const contentHeight = textarea.scrollHeight
  const targetHeight = Math.min(
    Math.max(oneLineHeight, contentHeight),
    maxHeight
  )

  textarea.style.height = `${targetHeight}px`
  textarea.style.overflowY =
    contentHeight > maxHeight ? 'auto' : 'hidden'
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('The file could not be read.'))
      }
    }

    reader.onerror = () => {
      reject(new Error('The file could not be read.'))
    }

    reader.readAsDataURL(file)
  })
}

function isTextFile(file) {
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

  // Follow the computer's light/dark appearance automatically.
  useEffect(() => {
    const preference = window.matchMedia(
      '(prefers-color-scheme: dark)'
    )

    function updateTheme(event) {
      setDarkMode(event.matches)
    }

    setDarkMode(preference.matches)

    if (preference.addEventListener) {
      preference.addEventListener('change', updateTheme)

      return () => {
        preference.removeEventListener('change', updateTheme)
      }
    }

    // Fallback for older browsers.
    preference.addListener(updateTheme)

    return () => {
      preference.removeListener(updateTheme)
    }
  }, [])

  // Keep the latest conversation message visible.
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

    let remainingSlots = MAX_FILES - attachments.length

    let totalImageBytes = attachments
      .filter((file) => file.kind === 'image')
      .reduce((total, file) => total + file.size, 0)

    let totalTextCharacters = attachments
      .filter((file) => file.kind === 'text')
      .reduce((total, file) => total + file.content.length, 0)

    const accepted = []
    const rejected = []

    for (const file of selected) {
      if (remainingSlots <= 0) {
        rejected.push(`Maximum ${MAX_FILES} attachments allowed`)
        break
      }

      if ((file.type || '').startsWith('image/')) {
        if (!IMAGE_TYPES.has(file.type)) {
          rejected.push(`${file.name}: use PNG, JPEG, or WebP`)
          continue
        }

        if (file.size > MAX_IMAGE_FILE_SIZE) {
          rejected.push(`${file.name}: image exceeds 1.5 MB`)
          continue
        }

        if (totalImageBytes + file.size > MAX_TOTAL_IMAGE_SIZE) {
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
          remainingSlots -= 1
        } catch {
          rejected.push(`${file.name}: could not read image`)
        }

        continue
      }

      if (!isTextFile(file)) {
        rejected.push(`${file.name}: unsupported file type`)
        continue
      }

      if (file.size > MAX_TEXT_FILE_SIZE) {
        rejected.push(`${file.name}: text file exceeds 200 KB`)
        continue
      }

      const remainingCharacters =
        MAX_TOTAL_TEXT - totalTextCharacters

      if (remainingCharacters <= 0) {
        rejected.push('Combined text attachment limit reached')
        continue
      }

      try {
        const originalText = await file.text()
        const content = originalText.slice(0, remainingCharacters)

        accepted.push({
          id: `${Date.now()}-${accepted.length}-${file.name}`,
          name: file.name,
          kind: 'text',
          size: file.size,
          content,
          truncated: originalText.length > content.length,
        })

        totalTextCharacters += content.length
        remainingSlots -= 1
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

    const displayContent =
      prompt ||
      (filesToSend.some((file) => file.kind === 'image')
        ? 'Please analyze the attached image(s).'
        : 'Please review the attached file(s).')

    const textContent = filesToSend
      .filter((file) => file.kind === 'text')
      .map((file) => {
        const note = file.truncated
          ? '\n[File content was shortened to fit the attachment limit.]'
          : ''

        return `--- File: ${file.name} ---\n${file.content}${note}`
      })
      .join('\n\n')

    const content = textContent
      ? `${displayContent}\n\nAttached file contents:\n\n${textContent}`
      : displayContent

    const nextMessages = [
      ...messages,
      {
        role: 'user',
        content,
        displayContent,
        images: filesToSend
          .filter((file) => file.kind === 'image')
          .map((file) => ({
            name: file.name,
            base64: file.base64,
          })),
        displayAttachments: filesToSend.map((file) => ({
          id: file.id,
          name: file.name,
          kind: file.kind,
          dataUrl: file.dataUrl || null,
        })),
      },
    ]

    setMessages(nextMessages)
    setInput('')
    setAttachments([])
    setLoading(true)
    setNotice('')

    if (inputRef.current) {
      inputRef.current.value = ''
      inputRef.current.style.height = '40px'
      inputRef.current.style.overflowY = 'hidden'
    }

    try {
      const history = nextMessages.slice(-MAX_HISTORY)

      // Attach image data to the latest image-bearing user message.
      let latestImageMessageIndex = -1

      history.forEach((message, index) => {
        if (message.role === 'user' && message.images?.length) {
          latestImageMessageIndex = index
        }
      })

      const apiMessages = history.map((message, index) => {
        const apiMessage = {
          role: message.role,
          content: message.content.slice(0, 8000),
        }

        if (index === latestImageMessageIndex) {
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
          isError: true,
          content:
            `I couldn't get a response from Ollama Cloud.\n\n` +
            `${error.message}\n\n` +
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
    transition: 'color 250ms ease, opacity 250ms ease',
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

        body {
          font-family: Roboto, Arial, sans-serif;
        }

        button,
        textarea {
          font: inherit;
        }

        .radium-message {
          animation: radium-appear 420ms cubic-bezier(.22, 1, .36, 1) both;
        }

        .radium-preview {
          animation: radium-appear 360ms cubic-bezier(.22, 1, .36, 1) both;
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
            transition-duration: .01ms !important;
            scroll-behavior: auto !important;
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
          transition:
            'background-color 350ms ease, color 350ms ease',
        }}
      >
        {/* Conversation window */}
        <section
          aria-label="Conversation"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
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
                  animation:
                    'radium-appear 600ms cubic-bezier(.22,1,.36,1) both',
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

        {/* Message composer */}
        <footer
          style={{
            flexShrink: 0,
            width: '100%',
            padding: '12px 18px 22px',
            background: theme.page,
            transition: 'background-color 350ms ease',
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
                padding: '10px 15px 9px 17px',
                boxShadow: darkMode
                  ? '0 2px 12px rgba(0,0,0,.08)'
                  : '0 2px 10px rgba(0,0,0,.045)',
                transition:
                  'background-color 350ms ease, border-color 350ms ease, box-shadow 350ms ease',
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
                          top: -5,
                          right: -5,
                          border: 'none',
                          background: 'transparent',
                          color: theme.text,
                          fontSize: 19,
                          lineHeight: 1,
                          padding: 0,
                          cursor: 'pointer',
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
                rows={1}
                placeholder="Type here"
                aria-label="Type here"
                onChange={(event) => {
                  setInput(event.target.value)
                  resizeComposer(event.currentTarget)
                }}
                onKeyDown={handleKeyDown}
                style={{
                  display: 'block',
                  width: '100%',
                  height: '40px',
                  minHeight: '40px',
                  maxHeight: '66px',
                  resize: 'none',
                  overflowY: 'hidden',
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
                  transition: 'height 140ms ease',
                }}
              />

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 14,
                  paddingTop: 3,
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

                {/* Plain plus sign: no circle or border. */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={
                    loading || attachments.length >= MAX_FILES
                  }
                  aria-label="Attach files or images"
                  title="Attach files or images"
                  style={{
                    ...{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: 'none',
                      background: 'transparent',
                      color: theme.text,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    },
                    width: 36,
                    height: 36,
                    padding: 0,
                    fontSize: 29,
                    fontWeight: 300,
                    lineHeight: 1,
                    opacity:
                      loading || attachments.length >= MAX_FILES ? 0.4 : 1,
                    transition: 'opacity 220ms ease, color 300ms ease',
                  }}
                >
                  +
                </button>

                {/* Thin outlined triangular send control. */}
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
                    padding: 0,
                    border: 'none',
                    borderRadius: 0,
                    background: 'transparent',
                    color: theme.text,
                    opacity: canSend ? 1 : 0.4,
                    cursor: canSend ? 'pointer' : 'not-allowed',
                    transition: 'opacity 220ms ease, color 300ms ease',
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
