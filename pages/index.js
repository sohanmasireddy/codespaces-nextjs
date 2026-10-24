
import Head from 'next/head'
import { useEffect, useRef, useState } from 'react'

// Base64 adds about one-third to image size. Keep all compressed JPEGs
// below 2.5 MiB so the request can fit within Vercel's body-size limit.
const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024
const MAX_SINGLE_JPEG_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_JPEG_BYTES = Math.floor(2.5 * 1024 * 1024)
const MAX_TEXT_FILE_BYTES = 200 * 1024
const MAX_TEXT_CHARACTERS = 5000
const MAX_FILES = 5
const MAX_HISTORY = 12
const MAX_IMAGE_EDGE = 2560
const MIN_IMAGE_BUDGET = 32 * 1024

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

function resizeComposer(textarea) {
  if (!textarea) return

  textarea.style.height = 'auto'

  const style = window.getComputedStyle(textarea)
  const lineHeight = Number.parseFloat(style.lineHeight) || 24
  const padding =
    (Number.parseFloat(style.paddingTop) || 0) +
    (Number.parseFloat(style.paddingBottom) || 0)

  const minHeight = lineHeight + padding
  const maxHeight = lineHeight * 2 + padding
  const contentHeight = textarea.scrollHeight

  textarea.style.height =
    `${Math.min(Math.max(minHeight, contentHeight), maxHeight)}px`

  textarea.style.overflowY =
    contentHeight > maxHeight ? 'auto' : 'hidden'
}

function readAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Could not read the compressed image.'))
      }
    }

    reader.onerror = () => {
      reject(new Error('Could not read the compressed image.'))
    }

    reader.readAsDataURL(blob)
  })
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('JPEG compression failed.'))
      },
      'image/jpeg',
      quality
    )
  })
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)

    return {
      width: bitmap.width,
      height: bitmap.height,
      draw(context, width, height) {
        context.drawImage(bitmap, 0, 0, width, height)
      },
      close() {
        if (typeof bitmap.close === 'function') bitmap.close()
      },
    }
  }

  // Fallback for browsers without createImageBitmap.
  const objectURL = URL.createObjectURL(file)
  const image = new Image()
  image.src = objectURL

  try {
    if (typeof image.decode === 'function') {
      await image.decode()
    } else {
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = () => reject(new Error('Could not open this image.'))
      })
    }
  } catch (error) {
    URL.revokeObjectURL(objectURL)
    throw error
  }

  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    draw(context, width, height) {
      context.drawImage(image, 0, 0, width, height)
    },
    close() {
      URL.revokeObjectURL(objectURL)
    },
  }
}

// Convert PNG, JPEG, or WebP to a smaller JPEG in the browser.
// Reduce quality first, then resolution if necessary.
async function compressImageToJpeg(file, byteLimit) {
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error('Choose an original image smaller than 25 MB.')
  }

  if (byteLimit < MIN_IMAGE_BUDGET) {
    throw new Error(
      'There is not enough room for another image. Remove an image or send this one separately.'
    )
  }

  const image = await decodeImage(file)

  try {
    if (!image.width || !image.height) {
      throw new Error('This image has invalid dimensions.')
    }

    let scale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(image.width, image.height)
    )

    const qualities = [0.86, 0.78, 0.70, 0.62, 0.54, 0.46]

    for (let resizeAttempt = 0; resizeAttempt < 10; resizeAttempt += 1) {
      const width = Math.max(1, Math.round(image.width * scale))
      const height = Math.max(1, Math.round(image.height * scale))
      const canvas = document.createElement('canvas')

      canvas.width = width
      canvas.height = height

      const context = canvas.getContext('2d', { alpha: false })

      if (!context) {
        throw new Error('Your browser could not prepare this image.')
      }

      // JPEG does not support transparency; fill transparent areas white.
      context.fillStyle = '#FFFFFF'
      context.fillRect(0, 0, width, height)
      image.draw(context, width, height)

      for (const quality of qualities) {
        const blob = await canvasToJpeg(canvas, quality)

        if (blob.size > 0 && blob.size <= byteLimit) {
          const dataURL = await readAsDataURL(blob)
          const comma = dataURL.indexOf(',')
          const base64 = comma >= 0 ? dataURL.slice(comma + 1) : ''

          if (!base64) {
            throw new Error('Compressed image data was empty.')
          }

          const baseName =
            file.name.replace(/\.[^/.]+$/, '') || 'image'

          return {
            name: `${baseName}.jpg`,
            kind: 'image',
            mime: 'image/jpeg',
            size: blob.size,
            base64,
            dataURL,
            width,
            height,
          }
        }
      }

      // Lower the resolution only when quality reduction was not enough.
      scale *= 0.8
    }

    throw new Error(
      'Could not compress this image enough. Try a smaller image.'
    )
  } finally {
    image.close()
  }
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

  // Follow the device's light/dark appearance automatically.
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

    if (!selected.length) return

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

      if ((file.type || '').startsWith('image/')) {
        if (!IMAGE_TYPES.has(file.type)) {
          rejected.push(`${file.name}: use PNG, JPEG, or WebP.`)
          continue
        }

        const imageBudget = Math.min(
          MAX_SINGLE_JPEG_BYTES,
          MAX_TOTAL_JPEG_BYTES - imageBytes
        )

        try {
          const compressed = await compressImageToJpeg(file, imageBudget)

          accepted.push({
            id: `${Date.now()}-${accepted.length}-${compressed.name}`,
            ...compressed,
          })

          imageBytes += compressed.size
          slots -= 1
        } catch (error) {
          rejected.push(`${file.name}: ${error.message}`)
        }

        continue
      }

      if (!isTextFile(file)) {
        rejected.push(`${file.name}: unsupported file type.`)
        continue
      }

      if (file.size > MAX_TEXT_FILE_BYTES) {
        rejected.push(`${file.name}: text files must be 200 KB or smaller.`)
        continue
      }

      const remaining = MAX_TEXT_CHARACTERS - textCharacters

      if (remaining <= 0) {
        rejected.push('Combined text attachment limit reached.')
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

        textCharacters += content.length
        slots -= 1
      } catch {
        rejected.push(`${file.name}: could not read this file.`)
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

    const textContent = files
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
        images: files
          .filter((file) => file.kind === 'image')
          .map(({ name, mime, base64 }) => ({ name, mime, base64 })),
        displayAttachments: files.map((file) => ({
          id: file.id,
          name: file.name,
          kind: file.kind,
          dataURL: file.dataURL || null,
        })),
      },
    ]

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
      let latestImageIndex = -1

      history.forEach((message, index) => {
        if (message.role === 'user' && message.images?.length) {
          latestImageIndex = index
        }
      })

      const apiMessages = history.map((message, index) => {
        const apiMessage = {
          role: message.role,
          content: String(message.content).slice(0, MAX_TEXT_CHARACTERS),
        }

        // Include just the latest image-bearing turn to control request size.
        if (index === latestImageIndex) {
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
        throw new Error(
          data.error || `Request failed (${response.status}).`
        )
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

  const plainButton = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    border: 'none',
    borderRadius: 0,
    background: 'transparent',
    color: theme.text,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'opacity 200ms ease, color 250ms ease',
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
                className="radium-in"
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
                    maxWidth: '100%',
                  }}
                >
                  <img
                    src={darkMode ? '/radium-logo-dark.png' : '/radium-logo.png'}
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
                                  maxWidth: 150,
                                  fontSize: 12,
                                  color: theme.muted,
                                }}
                              >
                                {file.kind === 'image' ? (
                                  <img
                                    src={file.dataURL}
                                    alt={file.name}
                                    style={{
                                      width: 132,
                                      height: 100,
                                      objectFit: 'cover',
                                      borderRadius: 10,
                                      border: `1px solid ${theme.border}`,
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      padding: '10px 12px',
                                      border: `1px solid ${theme.border}`,
                                      borderRadius: 9,
                                      overflowWrap: 'anywhere',
                                    }}
                                  >
                                    {file.name}
                                  </div>
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
                    className="radium-in"
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
              {/* Selected file labels and previews stay inside the prompt box. */}
              {attachments.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    padding: '2px 0 9px',
                  }}
                >
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
                          style={{
                            width: 42,
                            height: 42,
                            objectFit: 'cover',
                            borderRadius: 6,
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <span aria-hidden="true" style={{ padding: '0 4px' }}>
                          ▤
                        </span>
                      )}

                      <span
                        style={{
                          maxWidth: 160,
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
                          ...plainButton,
                          padding: '0 4px',
                          fontSize: 18,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={[
                    'image/png',
                    'image/jpeg',
                    'image/webp',
                    ...Array.from(TEXT_EXTENSIONS).map((extension) => `.${extension}`),
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
              <div
                role="status"
                style={{
                  marginTop: 8,
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
