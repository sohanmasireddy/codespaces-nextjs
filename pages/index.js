
import { useEffect, useRef, useState } from 'react'

const C = {
  bg: '#FAF9F6',
  sidebar: '#F2F0EB',
  text: '#292824',
  muted: '#858178',
  border: '#E7E4DC',
  accent: '#D97757',
  white: '#FFFFFF',
  userBubble: '#F0EEE8',
}

function Spark({ size = 24, color = C.accent }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        fontSize: size,
        lineHeight: 1,
      }}
    >
      ✳
    </span>
  )
}

function Home() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [notice, setNotice] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const updateLayout = () => {
      const mobile = window.innerWidth < 650
      setIsMobile(mobile)

      if (mobile) {
        setSidebarOpen(false)
      }
    }

    updateLayout()
    window.addEventListener('resize', updateLayout)

    return () => window.removeEventListener('resize', updateLayout)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    })
  }, [messages, loading])

  useEffect(() => {
    if (!notice) return

    const timer = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }, [input])

  async function sendMessage(text = input) {
    const prompt = text.trim()

    if (!prompt || loading) return

    const nextMessages = [
      ...messages,
      { role: 'user', content: prompt },
    ]

    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: nextMessages,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          data.error || `Request failed with status ${response.status}`
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
            `I couldn't connect to Ollama Cloud.\n\n` +
            `${error.message}\n\n` +
            'Check that your backend at /api/chat is configured and that your Ollama API key and model are correct.',
          isError: true,
        },
      ])
    } finally {
      setLoading(false)
      if (isMobile) setSidebarOpen(false)
    }
  }

  function newChat() {
    setMessages([])
    setInput('')
    setNotice('')

    if (isMobile) setSidebarOpen(false)

    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  const firstUserMessage = messages.find(
    (message) => message.role === 'user'
  )

  const chatTitle = firstUserMessage
    ? firstUserMessage.content.slice(0, 34) +
      (firstUserMessage.content.length > 34 ? '…' : '')
    : 'New conversation'

  const suggestions = [
    {
      icon: '✧',
      title: 'Explore an idea',
      description: 'Think through a problem or possibility',
      prompt:
        'Help me explore an interesting idea and develop it further.',
    },
    {
      icon: '⌘',
      title: 'Write some code',
      description: 'Build, debug, or improve a project',
      prompt:
        'Help me build a project. Start by asking what I want to create.',
    },
    {
      icon: '▤',
      title: 'Write something',
      description: 'Create, edit, or improve your writing',
      prompt:
        'Help me write something clear, engaging, and well structured.',
    },
    {
      icon: '◎',
      title: 'Learn something',
      description: 'Understand a difficult topic',
      prompt:
        'Teach me a challenging topic step by step, with examples.',
    },
  ]

  const baseButton = {
    border: 'none',
    background: 'transparent',
    color: C.text,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 14,
  }

  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: '100%',
        height: '100dvh',
        minHeight: 480,
        overflow: 'hidden',
        background: C.bg,
        color: C.text,
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* Mobile sidebar backdrop */}
      {isMobile && sidebarOpen && (
        <button
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 5,
            background: 'rgba(30, 28, 24, 0.25)',
            border: 'none',
            padding: 0,
          }}
        />
      )}

      {/* SIDEBAR */}
      <aside
        style={{
          position: isMobile ? 'fixed' : 'relative',
          inset: isMobile ? '0 auto 0 0' : 'auto',
          zIndex: isMobile ? 6 : 1,
          width: sidebarOpen ? 252 : 0,
          minWidth: sidebarOpen ? 252 : 0,
          height: '100%',
          boxSizing: 'border-box',
          overflow: 'hidden',
          background: C.sidebar,
          borderRight: sidebarOpen
            ? `1px solid ${C.border}`
            : 'none',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 180ms ease, min-width 180ms ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '24px 18px 28px',
            gap: 12,
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Spark size={24} />
            <span
              style={{
                fontSize: 17,
                fontWeight: 650,
                letterSpacing: '-0.6px',
              }}
            >
              GOD AI
            </span>
          </div>

          <button
            aria-label="Collapse sidebar"
            onClick={() => setSidebarOpen(false)}
            style={{
              ...baseButton,
              padding: 7,
              borderRadius: 8,
              color: C.muted,
              fontSize: 19,
            }}
          >
            ‹
          </button>
        </div>

        <div style={{ padding: '0 12px', whiteSpace: 'nowrap' }}>
          <button
            onClick={newChat}
            style={{
              ...baseButton,
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              width: '100%',
              padding: '11px 12px',
              borderRadius: 10,
              textAlign: 'left',
              background: '#E8E5DE',
              fontWeight: 550,
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>＋</span>
            New chat
          </button>

          <div
            style={{
              margin: '30px 10px 11px',
              color: C.muted,
              fontSize: 11,
              letterSpacing: '1.3px',
              fontWeight: 650,
            }}
          >
            WORKSPACE
          </div>

          <button
            onClick={() =>
              setNotice('Project workspaces are not configured yet.')
            }
            style={{
              ...baseButton,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              padding: '10px 12px',
              borderRadius: 9,
              textAlign: 'left',
              color: '#55524B',
            }}
          >
            <span style={{ width: 15, textAlign: 'center' }}>▦</span>
            Projects
          </button>

          <button
            onClick={() =>
              setNotice('Artifact tools are not configured yet.')
            }
            style={{
              ...baseButton,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              padding: '10px 12px',
              borderRadius: 9,
              textAlign: 'left',
              color: '#55524B',
            }}
          >
            <span style={{ width: 15, textAlign: 'center' }}>▧</span>
            Artifacts
          </button>

          <div
            style={{
              margin: '32px 10px 12px',
              color: C.muted,
              fontSize: 11,
              letterSpacing: '1.3px',
              fontWeight: 650,
            }}
          >
            RECENT
          </div>

          {firstUserMessage ? (
            <button
              onClick={() => inputRef.current?.focus()}
              title={chatTitle}
              style={{
                ...baseButton,
                display: 'block',
                width: '100%',
                padding: '10px 12px',
                borderRadius: 9,
                textAlign: 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                background: '#E8E5DE',
              }}
            >
              {chatTitle}
            </button>
          ) : (
            <div
              style={{
                padding: '4px 10px',
                color: '#99948A',
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: 'normal',
              }}
            >
              Your conversations will appear here.
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <div
          style={{
            borderTop: `1px solid ${C.border}`,
            padding: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: '#E1D9CB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 650,
              color: '#625A4E',
            }}
          >
            U
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              My account
            </div>
            <div
              style={{
                fontSize: 11,
                color: C.muted,
                marginTop: 3,
              }}
            >
              Personal workspace
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CHAT */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* HEADER */}
        <header
          style={{
            height: 64,
            minHeight: 64,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            borderBottom: `1px solid ${C.border}`,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              minWidth: 0,
            }}
          >
            {!sidebarOpen && (
              <button
                aria-label="Open sidebar"
                onClick={() => setSidebarOpen(true)}
                style={{
                  ...baseButton,
                  fontSize: 22,
                  color: C.muted,
                  padding: 4,
                  flexShrink: 0,
                }}
              >
                ☰
              </button>
            )}

            <span
              style={{
                fontSize: 14,
                fontWeight: 550,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {messages.length ? chatTitle : 'New chat'}
            </span>

            <span style={{ color: '#B3AEA4', fontSize: 11 }}>
              ⌄
            </span>
          </div>

          <div
            style={{
              fontSize: 12,
              color: C.muted,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#8FA88A',
              }}
            />
            AI workspace
          </div>
        </header>

        {/* CONVERSATION */}
        <section
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: isMobile ? '24px 16px 18px' : '30px 22px 20px',
            boxSizing: 'border-box',
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                maxWidth: 710,
                width: '100%',
                minHeight: '100%',
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                paddingBottom: 30,
                boxSizing: 'border-box',
              }}
            >
              <div style={{ marginBottom: 22 }}>
                <Spark size={34} />
              </div>

              <h1
                style={{
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontWeight: 400,
                  letterSpacing: '-1.8px',
                  fontSize: isMobile ? 36 : 'clamp(34px, 5vw, 48px)',
                  lineHeight: 1.16,
                  margin: '0 0 13px',
                  color: '#34332E',
                }}
              >
                What can I help you
                <br />
                with today?
              </h1>

              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.7,
                  color: C.muted,
                  margin: '0 0 35px',
                  maxWidth: 450,
                }}
              >
                Think, create, explore, and solve problems together.
                Start with a question or choose an idea below.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 12,
                }}
              >
                {suggestions.map((item) => (
                  <button
                    key={item.title}
                    onClick={() => sendMessage(item.prompt)}
                    style={{
                      background: 'rgba(255,255,255,0.65)',
                      border: `1px solid ${C.border}`,
                      borderRadius: 13,
                      padding: '17px 16px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      color: C.text,
                      minHeight: 105,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 18,
                        color: C.accent,
                        marginBottom: 12,
                      }}
                    >
                      {item.icon}
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        marginBottom: 5,
                      }}
                    >
                      {item.title}
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: C.muted,
                      }}
                    >
                      {item.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              style={{
                maxWidth: 760,
                width: '100%',
                margin: '0 auto',
                paddingBottom: 24,
              }}
            >
              {messages.map((message, index) => (
                <div
                  key={`${index}-${message.role}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems:
                      message.role === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: 28,
                  }}
                >
                  {message.role === 'assistant' && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        marginBottom: 10,
                        fontSize: 12,
                        fontWeight: 650,
                      }}
                    >
                      <Spark size={18} />
                      GOD AI
                    </div>
                  )}

                  <div
                    style={{
                      maxWidth: message.role === 'user' ? '88%' : '100%',
                      background:
                        message.role === 'user'
                          ? C.userBubble
                          : 'transparent',
                      borderRadius: message.role === 'user' ? 17 : 0,
                      padding:
                        message.role === 'user' ? '13px 17px' : '0 2px',
                      fontSize: 15,
                      lineHeight: 1.8,
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      color: message.isError ? '#B34D3B' : C.text,
                    }}
                  >
                    {message.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    color: C.muted,
                    fontSize: 13,
                    padding: '5px 0 25px',
                  }}
                >
                  <Spark size={19} />
                  Thinking…
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </section>

        {/* MESSAGE COMPOSER */}
        <div
          style={{
            padding: isMobile ? '10px 12px 12px' : '12px 22px 16px',
            background:
              'linear-gradient(to bottom, rgba(250,249,246,0), #FAF9F6 18%)',
          }}
        >
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div
              style={{
                border: '1px solid #DDD9D0',
                borderRadius: 18,
                background: C.white,
                padding: '13px 14px 10px 18px',
                boxShadow: '0 5px 20px rgba(48, 43, 32, 0.045)',
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value)
                }}
                onKeyDown={handleKeyDown}
                placeholder="Message GOD AI…"
                rows={1}
                aria-label="Message GOD AI"
                style={{
                  display: 'block',
                  width: '100%',
                  minHeight: 29,
                  maxHeight: 160,
                  resize: 'none',
                  overflowY: 'auto',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: C.text,
                  fontFamily: 'inherit',
                  fontSize: 15,
                  lineHeight: 1.65,
                  padding: '0 0 9px',
                  boxSizing: 'border-box',
                }}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: '#9A958B',
                  }}
                >
                  Shift + Enter for a new line
                </span>

                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  aria-label="Send message"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 11,
                    border: 'none',
                    background:
                      input.trim() && !loading
                        ? C.accent
                        : '#E9E6E0',
                    color:
                      input.trim() && !loading
                        ? '#FFFFFF'
                        : '#A6A197',
                    fontSize: 19,
                    cursor:
                      input.trim() && !loading
                        ? 'pointer'
                        : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  ↑
                </button>
              </div>
            </div>

            <div
              style={{
                fontSize: 11,
                lineHeight: 1.6,
                color: '#9A958B',
                textAlign: 'center',
                marginTop: 12,
              }}
            >
              GOD AI can make mistakes. Check important information.
            </div>
          </div>
        </div>

        {/* SMALL STATUS MESSAGE */}
        {notice && (
          <div
            role="status"
            style={{
              position: 'fixed',
              bottom: 85,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '11px 16px',
              background: '#33312C',
              color: '#FFFFFF',
              borderRadius: 10,
              fontSize: 13,
              boxShadow: '0 4px 18px #0002',
              maxWidth: '90vw',
              zIndex: 10,
            }}
          >
            {notice}
          </div>
        )}
      </main>
    </div>
  )
}

export default Home
