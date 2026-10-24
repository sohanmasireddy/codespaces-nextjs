
import Head from 'next/head'
import { useEffect, useRef, useState } from 'react'

const MAX_FILES = 5
const MAX_TEXT_BYTES = 200 * 1024
const MAX_IMAGE_BYTES = 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 1024 * 1024
const MAX_TEXT_CHARS = 12000
const MAX_HISTORY = 30

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

const COLORS = {
  light: {
    page: '#FFFFFF',
    text: '#262626',
    muted: '#777777',
    border: '#E5E5E5',
    bubble: '#F4F4F4',
    composer: '#FFFFFF',
  },
  dark: {
    page: '#212121',
    text: '#F4F4F4',
    muted: '#AAAAAA',
    border: '#454545',
    bubble: '#303030',
    composer: '#303030',
  },
}

function resizeComposer(element) {
  if (!element) return

  element.style.height = 'auto'

  const style = window.getComputedStyle(element)
  const lineHeight = parseFloat(style.lineHeight) || 24
  const padding =
    (parseFloat(style.paddingTop) || 0) +
    (parseFloat(style.paddingBottom) || 0)

  const minHeight = lineHeight + padding
  const maxHeight = lineHeight * 2 + padding
  const desiredHeight = Math.max(minHeight, element.scrollHeight)

  element.style.height = `${Math.min(desiredHeight, maxHeight)}px`
  element.style.overflowY = desiredHeight > maxHeight ? 'auto' : 'hidden'
}

function readDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Could not read the selected file.'))
      }
    }

    reader.onerror = () => reject(new Error('Could not read the selected file.'))
    reader.readAsDataURL(file)
  })
}

function isTextFile(file) {
  const extension = file.name.split('.').pop().toLowerCase()
  return TEXT_EXTENSIONS.has(extension) ||
    (file.type || '').startsWith('text/')
}

function SendTriangle({ color }) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4 L19.15 16.38 L4.85 16.38 Z"
        stroke={color}
        strokeWidth="1.65"
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

  const theme = darkMode ? COLORS.dark : COLORS.light
  const canSend =
    !loading && (input.trim().length > 0 || attachments.length > 0)

  // Follow the device's appearance setting automatically.
  useEffect(() => {
    const preference = window.matchMedia('(prefers-color-scheme: dark)')

    const updateTheme = (event) => setDarkMode(event.matches)
    setDarkMode(preference.matches)

    if (preference.addEventListener) {
      preference.addEventListener('change', updateTheme)
      return () => preference.removeEventListener('change', updateTheme)
    }

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

    if (selected.length === 0) return

    let slots = MAX_FILES - attachments.length
    let imageBytes = attachments
      .filter((file) => file.kind === 'image')
      .reduce((sum, file) => sum + file.size, 0)

    let textCharacters = attachments
      .filter((file) => file.kind === 'text')
      .reduce((sum, file) => sum + file.content.length, 0)

    const accepted = []
    const rejected = []

    for (const file of selected) {
      if (slots <= 0) {
        rejected.push(`You can attach up to ${MAX_FILES} files.`)
        break
      }

      if (IMAGE_TYPES.has(file.type)) {
        if (file.size > MAX_IMAGE_BYTES) {
          rejected.push(`${file.name}: images must be 1 MB or smaller.`)
          continue
        }

        if (imageBytes + file.size > MAX_TOTAL_IMAGE_BYTES) {
          rejected.push('Combined image size cannot exceed 1 MB.')
          continue
        }

        try {
          const dataURL = await readDataURL(file)
          const base64 = dataURL.split(',')[1]

          if (!base64) {
            rejected.push(`${file.name}: invalid image data.`)
            continue
          }

          accepted.push({
            id: `${Date.now()}-${accepted.length}-${file.name}`,
            name: file.name,
            kind: 'image',
            mime: file.type,
            size: file.size,
            base64,
            dataURL,
          })

          imageBytes += file.size
          slots -= 1
        } catch {
          rejected.push(`${file.name}: could not read the image.`)
        }

        continue
      }

      if ((file.type || '').startsWith('image/')) {
        rejected.push(`${file.name}: use PNG, JPEG, or WebP images.`)
        continue
      }

      if (!isTextFile(file)) {
        rejected.push(`${file.name}: unsupported file type.`)
        continue
      }

      if (file.size > MAX_TEXT_BYTES) {
        rejected.push(`${file.name}: text files must be 200 KB or smaller.`)
        continue
      }

      const remaining = MAX_TEXT_CHARS - textCharacters

      if (remaining <= 0) {
        rejected.push('The combined text attachment limit was reached.')
        continue
      }

      try {
        const original = await file.text()
        const content = original.slice(0, remaining)

        accepted.push({
          id: `${Date.now()}-${accepted.length}-${file.name}`,
          name: file.name,
          kind: 'text',
          content,
          size: file.size,
          truncated: original.length > content.length,
        })

        textCharacters += content.length
        slots -= 1
      } catch {
        rejected.push(`${file.name}: could not read the file.`)
      }
    }

    if (accepted.length) {
      setAttachments((current) => [...current, ...accepted])
    }

    if (rejected.length) {
      setNotice(rejected.join(' '))
    }
  }

  function removeAttachment(id) {
    setAttachments((current) => current.filter((file) => file.id !== id))
  }

  async function sendMessage() {
    const prompt = input.trim()

    if ((!prompt && attachments.length === 0) || loading) return

    const files = [...attachments]

    const displayContent =
      prompt ||
      (files.some((file) => file.kind === 'image')
        ? 'Please analyze the attached image(s).'
        : 'Please review the attached file(s).')

    const fileText = files
      .filter((file) => file.kind === 'text')
      .map((file) => {
        const note = file.truncated
          ? '\n[File content shortened to fit the attachment limit.]'
          : ''

        return `--- File: ${file.name} ---\n${file.content}${note}`
      })
      .join('\n\n')

    const content = fileText
      ? `${displayContent}\n\nAttached file contents:\n\n${fileText}`
      : displayContent

    const userMessage = {
      role: 'user',
      content,
      displayContent,
      images: files
        .filter((file) => file.kind === 'image')
        .map(({ name, mime, base64 }) => ({ name, mime, base64 })),
      displayAttachments: files.map((file) => ({
        id: file.id,
        name: file.name,
        kind: file.kind,
        dataURL: file.dataURL || null,
      })),
    }

    const nextMessages = [...messages, userMessage]

    setMessages(nextMessages)
    setInput('')
    setAttachments([])
    setLoading(true)
    setNotice('')

    if (inputRef.current) {
      inputRef.current.style.height = '40px'
      inputRef.current.style.overflowY = 'hidden'
    }

    try {
      const history = nextMessages.slice(-MAX_HISTORY)

      // Send Base64 image data with the message that contains each image.
      const apiMessages = history.map((message) => {
        const apiMessage = {
          role: message.role,
          content: message.content.slice(0, 8000),
        }

        if (message.role === 'user' && message.images?.length) {
          apiMessage.images = message.images.map((image) => image.base64)
        }

        return apiMessage
      })

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status}).`)
      }

      const reply = data.reply || data.message?.content || data.output_text

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

  const plainButton = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 0,
    background: 'transparent',
    color: theme.text,
    padding: 0,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'opacity 200ms ease, color 300ms ease',
  }

  return (
    <>
      <Head>
        <title>Radium</title>
        <meta name="application-name" content="Radium" />
        <meta name="theme-color" content={theme.page} />
        <link
          rel="icon"
          type="image/png"
          href={darkMode ? '/radium-logo-dark.png' : '/radium-logo.png'}
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
        html, body, #__next {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
        }

        * { box-sizing: border-box; }

        body, button, textarea {
          font-family: Roboto, Arial, sans-serif;
        }

        .radium-in {
          animation: radium-in 350ms cubic-bezier(.22, 1, .36, 1) both;
        }

        @keyframes radium-in {
          from { opacity: 0; transform: translateY(7px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
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
          transition: 'background-color 300ms ease, color 300ms ease',
        }}
      >
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
                }}
              >
                <div
                  className="radium-in"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 13,
                    maxWidth: '100%',
                  }}
                >
                  <img
                    src={darkMode ? '/radium-logo-dark.png' : '/radium-logo.png'}
                    alt="Radium logo"
                    width="96"
                    height="96"
                    style={{
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
                    className="radium-in"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
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
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                            {message.displayAttachments.map((file) => (
                              <div key={file.id} style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 150, fontSize: 12, color: theme.muted }}>
                                {file.kind === 'image' ? (
                                  <img
                                    src={file.dataURL}
                                    alt={file.name}
                                    style={{ width: 132, height: 100, objectFit: 'cover', borderRadius: 10, border: `1px solid ${theme.border}` }}
                                  />
                                ) : (
                                  <div style={{ padding: '10px 12px', border: `1px solid ${theme.border}`, borderRadius: 9, overflowWrap: 'anywhere' }}>
                                    {file.name}
                                  </div>
                                )}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                  <div role="status" className="radium-in" style={{ margin: '8px 0 28px', fontSize: 14, color: theme.muted }}>
                    Radium is thinking…
                  </div>
                )}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </section>

        <footer
          style={{
            flexShrink: 0,
            width: '100%',
            padding: '12px 18px 22px',
            background: theme.page,
          }}
        >
          <div style={{ maxWidth: 768, width: '100%', margin: '0 auto' }}>
            <div
              style={{
                width: '100%',
                border: `1px solid ${theme.border}`,
                borderRadius: 26,
                background: theme.composer,
                padding: '8px 12px',
                boxShadow: darkMode ? 'none' : '0 2px 10px rgba(0,0,0,.045)',
                transition: 'background-color 300ms ease, border-color 300ms ease',
              }}
            >
              {/* Attachments and filenames stay inside the prompt box. */}
              {attachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '2px 0 9px' }}>
                  {attachments.map((file) => (
                    <div
                      key={file.id}
                      className="radium-in"
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        minWidth: 0,
                        maxWidth: '100%',
                        padding: 5,
                        border: `1px solid ${theme.border}`,
                        borderRadius: 10,
                        color: theme.muted,
                        fontSize: 12,
                      }}
                    >
                      {file.kind === 'image' ? (
                        <img
                          src={file.dataURL}
                          alt={file.name}
                          style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                        />
                      ) : (
                        <span aria-hidden="true" style={{ padding: '0 4px' }}>▤</span>
                      )}

                      <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.name}
                      </span>

                      <button
                        type="button"
                        aria-label={`Remove ${file.name}`}
                        onClick={() => removeAttachment(file.id)}
                        style={{ ...plainButton, padding: '0 4px', fontSize: 18 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Compact prompt row: plus, text, triangle. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={[
                    'image/png',
                    'image/jpeg',
                    'image/webp',
                    ...Array.from(TEXT_EXTENSIONS).map((ext) => `.${ext}`),
                    'text/*',
                  ].join(',')}
                  onChange={handleFilesSelected}
                  style={{ display: 'none' }}
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || attachments.length >= MAX_FILES}
                  aria-label="Attach files or images"
                  title="Attach files or images"
                  style={{
                    ...plainButton,
                    width: 30,
                    height: 36,
                    flexShrink: 0,
                    fontSize: 27,
                    fontWeight: 300,
                    opacity: loading || attachments.length >= MAX_FILES ? 0.4 : 1,
                    cursor: loading || attachments.length >= MAX_FILES ? 'not-allowed' : 'pointer',
                  }}
                >
                  +
                </button>

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
                    flex: 1,
                    minWidth: 0,
                    display: 'block',
                    height: 40,
                    minHeight: 40,
                    maxHeight: 64,
                    margin: 0,
                    padding: '8px 0',
                    resize: 'none',
                    overflowY: 'hidden',
                    border: 'none',
                    outline: 'none',
                    boxShadow: 'none',
                    background: 'transparent',
                    color: theme.text,
                    fontFamily: 'Roboto, Arial, sans-serif',
                    fontSize: 16,
                    lineHeight: '24px',
                    boxSizing: 'border-box',
                    transition: 'height 140ms ease',
                  }}
                />

                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={!canSend}
                  aria-label="Send message"
                  title="Send message"
                  style={{
                    ...plainButton,
                    width: 32,
                    height: 36,
                    flexShrink: 0,
                    opacity: canSend ? 1 : 0.4,
                    cursor: canSend ? 'pointer' : 'not-allowed',
                  }}
                >
                  <SendTriangle color={theme.text} />
                </button>
              </div>
            </div>

            {notice && (
              <div role="status" style={{ marginTop: 8, fontSize: 12, color: '#E05B55', overflowWrap: 'anywhere' }}>
                {notice}
              </div>
            )}
          </div>
        </footer>
      </main>
    </>
  )
}
