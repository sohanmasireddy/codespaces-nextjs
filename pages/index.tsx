import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  FluentProvider,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Textarea,
  Tooltip,
  webDarkTheme,
  webLightTheme,
} from '@fluentui/react-components'
import {
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Film,
  Menu as MenuIcon,
  MessageSquare,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type FileUIPart, type UIMessage } from 'ai'
import { code } from '@streamdown/code'
import { math } from '@streamdown/math'
import { mermaid } from '@streamdown/mermaid'
import { Streamdown, type Components } from 'streamdown'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ClipboardEvent, DragEvent, FormEvent, KeyboardEvent } from 'react'
import {
  loadConversations,
  removeConversation,
  saveConversation,
  type Conversation,
} from '../lib/conversations'
import {
  defaultModelId,
  models,
  type ModelId,
  type ResponseMode,
  type ThinkingLevel,
} from '../lib/models'

type ThemeName = 'light' | 'dark'
type AttachmentKind = 'image' | 'video' | 'text'
type Attachment = {
  id: string
  file: File
  kind: AttachmentKind
  previewUrl?: string
}

const textExtensions = new Set([
  'txt', 'md', 'csv', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'js', 'jsx',
  'ts', 'tsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh', 'sql', 'log',
])

function createConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    updatedAt: Date.now(),
    messages: [],
    modelId: defaultModelId,
    mode: 'auto',
    thinkingLevel: 'maximum',
    modelPreferences: {},
  }
}

function getMessageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
}

function getTitle(messages: UIMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === 'user')
  if (!firstUserMessage) return 'New chat'
  const text = getMessageText(firstUserMessage)
    .replace(/\n\n--- Attachment: [\s\S]*$/g, '')
    .trim()
  return text.length > 42 ? `${text.slice(0, 42).trimEnd()}…` : text || 'New chat'
}

function formatUpdatedAt(timestamp: number) {
  const date = new Date(timestamp)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const modelLogoPaths: Record<ModelId, string> = {
  '@cf/qwen/qwen3.8-27b': '/model-qwen.png',
  '@cf/google/gemma-4-26b-a4b-it': '/model-gemma.png',
  '@cf/meta/llama-4-scout-17b-16e-instruct': '/model-llama.png',
}

function ModelLogo({ modelId }: { modelId: ModelId }) {
  const [available, setAvailable] = useState(true)
  useEffect(() => {
    setAvailable(true)
  }, [modelId])
  if (!available) return null
  const isExpandedLogo =
    modelId === '@cf/qwen/qwen3.8-27b' ||
    modelId === '@cf/google/gemma-4-26b-a4b-it'
  return (
    <img
      className={`model-logo${isExpandedLogo ? ' model-logo-expanded' : ''}`}
      src={modelLogoPaths[modelId]}
      alt=""
      onError={() => setAvailable(false)}
    />
  )
}

function Composer({
  modelId,
  mode,
  thinkingLevel,
  status,
  onModelChange,
  onModeChange,
  onThinkingChange,
  onSubmit,
  onStop,
  welcome = false,
}: {
  modelId: ModelId
  mode: ResponseMode
  thinkingLevel: ThinkingLevel
  status: string
  onModelChange: (modelId: ModelId) => void
  onModeChange: (mode: ResponseMode) => void
  onThinkingChange: (level: ThinkingLevel) => void
  onSubmit: (text: string, attachments: Attachment[]) => Promise<void>
  onStop: () => void
  welcome?: boolean
}) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const objectUrls = useRef(new Set<string>())
  const isGenerating = status === 'submitted' || status === 'streaming'
  const selectedModel = models.find((model) => model.id === modelId) ?? models[0]
  const thinkingLevels = selectedModel.thinkingLevels

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url))
    objectUrls.current.clear()
  }, [])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 190)}px`
  }, [input])

  const addFiles = useCallback((files: File[]) => {
    const next: Attachment[] = []
    let issue = ''
    for (const file of files) {
      if (attachments.length + next.length >= 4) {
        issue = 'Add up to four files per message.'
        break
      }

      const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
      let kind: AttachmentKind | undefined
      if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        kind = 'image'
        if (file.size > 1_500_000) {
          issue = 'Each image must be smaller than 1.5 MB.'
          continue
        }
      } else if (file.type.startsWith('video/')) {
        kind = 'video'
        if (file.size > 8_000_000) {
          issue = 'Each video preview must be smaller than 8 MB.'
          continue
        }
      } else if (file.type.startsWith('text/') || file.type === 'application/json' || textExtensions.has(extension)) {
        kind = 'text'
        if (file.size > 250_000) {
          issue = 'Text files must be smaller than 250 KB.'
          continue
        }
        if (
          attachments
            .filter((attachment) => attachment.kind === 'text')
            .reduce((size, attachment) => size + attachment.file.size, 0) +
            next.filter((attachment) => attachment.kind === 'text').reduce((size, attachment) => size + attachment.file.size, 0) +
            file.size > 500_000
        ) {
          issue = 'Keep the combined text document size below 500 KB per message.'
          continue
        }
      }

      if (!kind) {
        issue = `${file.name} is not a supported image or text document. Try TXT, MD, CSV, JSON, or a source file.`
        continue
      }

      if (
        kind === 'image' &&
        attachments
          .filter((attachment) => attachment.kind === 'image')
          .reduce((size, attachment) => size + attachment.file.size, 0) +
          next.filter((attachment) => attachment.kind === 'image').reduce((size, attachment) => size + attachment.file.size, 0) +
          file.size > 1_600_000
      ) {
        issue = 'Keep the combined image size below 1.6 MB per message.'
        continue
      }

      const previewUrl = kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : undefined
      if (previewUrl) objectUrls.current.add(previewUrl)
      next.push({ id: crypto.randomUUID(), file, kind, previewUrl })
    }

    if (next.length) setAttachments((current) => [...current, ...next])
    setNotice(issue)
  }, [attachments.length])

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.currentTarget.files ?? []))
    event.currentTarget.value = ''
  }

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'))
    if (images.length) addFiles(images)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    addFiles(Array.from(event.dataTransfer.files))
  }

  const removeAttachment = (id: string) => {
    const attachment = attachments.find((item) => item.id === id)
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl)
      objectUrls.current.delete(attachment.previewUrl)
    }
    setAttachments((current) => current.filter((item) => item.id !== id))
  }

  const submit = async (event?: FormEvent, suggestedText?: string) => {
    event?.preventDefault()
    const text = (suggestedText ?? input).trim()
    if ((!text && attachments.length === 0) || isGenerating || busy) return
    if (attachments.some((attachment) => attachment.kind === 'video')) {
      setNotice('Video analysis is not supported by these models. Remove the video or attach still images.')
      return
    }

    setBusy(true)
    setNotice('')
    try {
      const textAttachments = await Promise.all(
        attachments
          .filter((attachment) => attachment.kind === 'text')
          .map(async ({ file }) => `\n\n--- Attachment: ${file.name} ---\n${await file.text()}`),
      )
      const message = `${text}${textAttachments.join('')}`
      await onSubmit(message, attachments.filter((item) => item.kind === 'image'))
      setInput('')
      setAttachments([])
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url))
      objectUrls.current.clear()
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send this message.')
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <div
      className={`composer-wrap ${welcome ? 'composer-wrap-welcome' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      {attachments.length > 0 && (
        <div className="attachment-list" aria-label="Attachments">
          {attachments.map((attachment) => (
            <div className="attachment-preview" key={attachment.id}>
              {attachment.kind === 'image' && attachment.previewUrl ? (
                <img src={attachment.previewUrl} alt={attachment.file.name} />
              ) : attachment.kind === 'video' && attachment.previewUrl ? (
                <video src={attachment.previewUrl} aria-label={`Preview of ${attachment.file.name}`} />
              ) : attachment.kind === 'video' ? (
                <Film size={18} />
              ) : (
                <FileText size={18} />
              )}
              <span className="attachment-name" title={attachment.file.name}>
                {attachment.file.name}
                <small>{(attachment.file.size / 1024).toFixed(0)} KB</small>
              </span>
              <Tooltip content="Remove attachment" relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<X size={15} />}
                  aria-label={`Remove ${attachment.file.name}`}
                  onClick={() => removeAttachment(attachment.id)}
                />
              </Tooltip>
            </div>
          ))}
        </div>
      )}
      {attachments.some((attachment) => attachment.kind === 'video') && (
        <p className="attachment-note">Videos can be previewed, but video analysis is not available.</p>
      )}
      <form className="composer" onSubmit={(event) => void submit(event)}>
        <Textarea
          ref={textareaRef}
          className="composer-input"
          value={input}
          onChange={(event) => setInput(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={welcome ? 'Ask anything…' : 'Reply…'}
          aria-label="Message"
          maxLength={20_000}
          resize="none"
          rows={1}
        />
        <div className="composer-controls">
          <div className="composer-left-controls">
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp,video/*,.txt,.md,.csv,.json,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.go,.rs,.java,.c,.cpp,.h,.sh,.sql,.log"
              multiple
              onChange={onFileChange}
              aria-label="Choose attachments"
            />
            <Tooltip content="Add images, video, or files" relationship="label">
              <Button
                className="composer-tool"
                appearance="subtle"
                icon={<Paperclip className="composer-action-icon" size={19} />}
                aria-label="Add attachments"
                onClick={() => fileInputRef.current?.click()}
              />
            </Tooltip>
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button
                  appearance="subtle"
                  className="model-menu-trigger"
                  aria-label={`Selected model: ${selectedModel.name}`}
                >
                  <ModelLogo modelId={selectedModel.id} />
                  <span>{selectedModel.name}</span>
                  <ChevronDown size={14} />
                </Button>
              </MenuTrigger>
              <MenuPopover className="chat-menu-popover">
                <MenuList>
                  {models.map((model) => (
                    <MenuItem
                      key={model.id}
                      onClick={() => onModelChange(model.id)}
                      secondaryContent={model.id === modelId ? <Check size={15} /> : undefined}
                    >
                      <span className="model-menu-option">
                        <ModelLogo modelId={model.id} />
                        <strong>{model.name}</strong>
                      </span>
                    </MenuItem>
                  ))}
                </MenuList>
              </MenuPopover>
            </Menu>
            {mode === 'thinking' && thinkingLevels.length > 0 && (
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button
                    appearance="subtle"
                    className="thinking-level-trigger"
                    aria-label={`Reasoning effort: ${thinkingLevel}`}
                  >
                    {thinkingLevel === 'maximum'
                      ? 'Maximum'
                      : thinkingLevel[0].toUpperCase() + thinkingLevel.slice(1)}
                    <ChevronDown size={14} />
                  </Button>
                </MenuTrigger>
                <MenuPopover className="chat-menu-popover">
                  <MenuList>
                    {thinkingLevels.map((level) => (
                      <MenuItem
                        key={level}
                        onClick={() => onThinkingChange(level)}
                        secondaryContent={thinkingLevel === level ? <Check size={15} /> : undefined}
                      >
                        {level === 'maximum' ? 'Maximum' : level[0].toUpperCase() + level.slice(1)}
                      </MenuItem>
                    ))}
                  </MenuList>
                </MenuPopover>
              </Menu>
            )}
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button
                  appearance="subtle"
                  className="settings-trigger"
                  icon={<Sparkles className="composer-action-icon" size={19} />}
                  aria-label="Model response settings"
                >
                  <span>{mode === 'auto' ? 'Auto' : mode === 'fast' ? 'Fast' : 'Thinking'}</span>
                  <ChevronDown size={14} />
                </Button>
              </MenuTrigger>
              <MenuPopover className="chat-menu-popover">
                <div className="settings-menu">
                  <div className="settings-label">Response mode</div>
                  {selectedModel.modes.map((option) => (
                    <MenuItem
                      key={option}
                      onClick={() => onModeChange(option)}
                      secondaryContent={mode === option ? <Check size={15} /> : undefined}
                    >
                      {option === 'auto' ? 'Auto' : option === 'fast' ? 'Fast' : 'Thinking'}
                    </MenuItem>
                  ))}
                  {mode === 'fast' && <p className="settings-help">Uses a shorter output limit; speed depends on provider load.</p>}
                  {mode === 'thinking' && thinkingLevels.length === 0 && (
                    <p className="settings-help">Thinking is enabled, but this model does not expose a reasoning-effort setting.</p>
                  )}
                </div>
              </MenuPopover>
            </Menu>
          </div>
          {isGenerating ? (
            <Tooltip content="Stop generating" relationship="label">
              <Button
                className="send-button stop-button"
                appearance="primary"
                icon={<Square size={15} fill="currentColor" />}
                aria-label="Stop generating"
                onClick={onStop}
              />
            </Tooltip>
          ) : (
            <Tooltip content="Send message" relationship="label">
              <Button
                className="send-button"
                appearance="primary"
                icon={<ArrowUp size={18} />}
                aria-label="Send message"
                type="submit"
                disabled={(!input.trim() && attachments.length === 0) || busy}
              />
            </Tooltip>
          )}
        </div>
      </form>
      {notice && <p className="composer-notice" role="status">{notice}</p>}
    </div>
  )
}

function MessageContent({
  message,
  generating,
  onRegenerate,
}: {
  message: UIMessage
  generating: boolean
  onRegenerate: () => void
}) {
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const text = getMessageText(message)
  const userText = text.replace(/\n\n--- Attachment: ([^\n]+) ---\n[\s\S]*$/g, '')
  const attachedFiles = message.parts.filter((part) => part.type === 'file')
  const textFileLabels = Array.from(text.matchAll(/--- Attachment: ([^\n]+) ---/g)).map((match) => match[1])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setCopyFailed(false)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopyFailed(true)
      window.setTimeout(() => setCopyFailed(false), 2500)
    }
  }

  return (
    <article className={`message-row message-${message.role}`}>
      {message.role === 'user' ? (
        <div className="user-message-body">
          {userText && <p className="user-message-text">{userText}</p>}
          {textFileLabels.map((name) => (
            <span className="message-file-pill" key={name}><FileText size={14} />{name}</span>
          ))}
          {attachedFiles.map((part, index) => (
            part.type === 'file' && part.mediaType.startsWith('image/') ? (
              <img className="message-image" key={`${part.filename ?? 'image'}-${index}`} src={part.url} alt={part.filename ?? 'Attached image'} />
            ) : null
          ))}
        </div>
      ) : (
        <div className="assistant-message-body">
          {message.parts.map((part, index) => (
            part.type === 'text' ? (
              <Streamdown
                key={`${message.id}-${index}`}
                className="markdown-body"
                animated
                isAnimating={generating}
                plugins={{ code, math, mermaid }}
                controls={{ code: { copy: true }, table: { copy: true } }}
                linkSafety={{ enabled: true }}
                components={{ img: MarkdownImage }}
              >
                {part.text}
              </Streamdown>
            ) : null
          ))}
          {!generating && text.length > 0 && (
            <div className="message-actions">
              <Tooltip content={copied ? 'Copied' : copyFailed ? 'Clipboard access was denied' : 'Copy response'} relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={copied ? <Check size={15} /> : <Copy size={15} />}
                  aria-label="Copy response"
                  onClick={() => void copy()}
                />
              </Tooltip>
              <Tooltip content="Regenerate response" relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<RotateCcw size={15} />}
                  aria-label="Regenerate response"
                  onClick={onRegenerate}
                />
              </Tooltip>
              <span className="action-spacer" />
              <Tooltip content="Good response" relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  className={feedback === 'up' ? 'feedback-selected' : ''}
                  icon={<ThumbsUp size={15} />}
                  aria-label="Good response"
                  aria-pressed={feedback === 'up'}
                  onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
                />
              </Tooltip>
              <Tooltip content="Poor response" relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  className={feedback === 'down' ? 'feedback-selected' : ''}
                  icon={<ThumbsDown size={15} />}
                  aria-label="Poor response"
                  aria-pressed={feedback === 'down'}
                  onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
                />
              </Tooltip>
            </div>
          )}
          {copyFailed && <span className="copy-error" role="status">Could not copy. Check clipboard permissions.</span>}
        </div>
      )}
    </article>
  )
}

const MarkdownImage: Components['img'] = ({ node: _node, ...props }) => {
  const [failed, setFailed] = useState(false)
  if (failed || !props.src) {
    return <span className="image-fallback">{props.alt || 'Image could not be loaded.'}</span>
  }
  return (
    <img
      {...props}
      loading="lazy"
      onError={() => setFailed(true)}
      alt={props.alt ?? ''}
    />
  )
}

function ChatSession({
  conversation,
  theme,
  onUpdate,
}: {
  conversation: Conversation
  theme: ThemeName
  onUpdate: (patch: Partial<Conversation>) => void
}) {
  const settingsRef = useRef({
    modelId: conversation.modelId,
    mode: conversation.mode,
    thinkingLevel: conversation.thinkingLevel,
  })
  settingsRef.current = {
    modelId: conversation.modelId,
    mode: conversation.mode,
    thinkingLevel: conversation.thinkingLevel,
  }

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    prepareSendMessagesRequest: ({ messages }) => {
      const history = messages.slice(-20)
      const lastUserIndex = history.findLastIndex((message) => message.role === 'user')
      return {
        body: {
          modelId: settingsRef.current.modelId,
          mode: settingsRef.current.mode,
          thinkingLevel: settingsRef.current.thinkingLevel,
          messages: history.map((message, index) => {
            if (index === lastUserIndex || message.role !== 'user') return message
            const oldImages = message.parts.filter((part) => part.type === 'file')
            if (oldImages.length === 0) return message
            return {
              ...message,
              parts: [
                ...message.parts.filter((part) => part.type !== 'file'),
                ...oldImages.map((part) => ({
                  type: 'text' as const,
                  text: `[Earlier image attachment${part.type === 'file' && part.filename ? `: ${part.filename}` : ''} not resent.]`,
                })),
              ],
            }
          }),
        },
      }
    },
  }), [])

  const { messages, sendMessage, status, stop, regenerate, error } = useChat({
    id: conversation.id,
    messages: conversation.messages,
    transport,
  })
  const isGenerating = status === 'submitted' || status === 'streaming'
  const conversationRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const firstUserMessage = messages.find((message) => message.role === 'user')
    onUpdate({
      messages,
      updatedAt: Date.now(),
      ...(conversation.title === 'New chat' && firstUserMessage
        ? { title: getTitle(messages) }
        : {}),
    })
  }, [messages, onUpdate, conversation.title])

  useEffect(() => {
    const scrollContainer = conversationRef.current
    if (!scrollContainer) return
    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: status === 'streaming' ? 'auto' : 'smooth',
    })
  }, [messages, status])

  const changeModel = (modelId: ModelId) => {
    const preferences = {
      ...conversation.modelPreferences,
      [conversation.modelId]: {
        mode: conversation.mode,
        thinkingLevel: conversation.thinkingLevel,
      },
    }
    const nextPreference = preferences[modelId] ?? { mode: 'auto' as const, thinkingLevel: 'maximum' as const }
    onUpdate({
      modelId,
      mode: models.find((model) => model.id === modelId)?.modes.some((availableMode) => availableMode === nextPreference.mode)
        ? nextPreference.mode
        : 'auto',
      thinkingLevel: nextPreference.thinkingLevel,
      modelPreferences: preferences,
    })
  }

  const updateModelPreference = (patch: { mode?: ResponseMode; thinkingLevel?: ThinkingLevel }) => {
    const nextMode = patch.mode ?? conversation.mode
    const nextThinkingLevel = patch.thinkingLevel ?? conversation.thinkingLevel
    onUpdate({
      ...patch,
      modelPreferences: {
        ...conversation.modelPreferences,
        [conversation.modelId]: {
          mode: nextMode,
          thinkingLevel: nextThinkingLevel,
        },
      },
    })
  }

  const handleSubmit = async (text: string, attachments: Attachment[]) => {
    const imageParts: FileUIPart[] = await Promise.all(attachments.map(async ({ file }) => ({
      type: 'file',
      mediaType: file.type,
      filename: file.name,
      url: await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
        reader.readAsDataURL(file)
      }),
    })))
    await sendMessage({ text, files: imageParts })
  }

  return (
    <div className={`chat-session ${theme === 'dark' ? 'is-dark' : ''}`}>
      <div ref={conversationRef} className={`conversation-scroll ${messages.length === 0 ? 'is-welcome' : ''}`}>
        {messages.length === 0 ? (
          <div className="welcome-content">
            <div className="welcome-title">
              <h1>ABC123</h1>
            </div>
            <Composer
              welcome
              modelId={conversation.modelId}
              mode={conversation.mode}
              thinkingLevel={conversation.thinkingLevel}
              status={status}
              onModelChange={changeModel}
              onModeChange={(mode) => updateModelPreference({ mode })}
              onThinkingChange={(thinkingLevel) => updateModelPreference({ thinkingLevel })}
              onSubmit={handleSubmit}
              onStop={() => void stop()}
            />
          </div>
        ) : (
          <div className="message-list">
            {messages.map((message, index) => (
              <MessageContent
                key={message.id}
                message={message}
                generating={isGenerating && index === messages.length - 1}
                onRegenerate={() => void regenerate()}
              />
            ))}
            {isGenerating && messages[messages.length - 1]?.role === 'user' && (
              <div className="thinking-indicator"><span className="typing-dots"><i /><i /><i /></span> Thinking</div>
            )}
          </div>
        )}
      </div>
      {error && <div className="error-banner" role="alert">{error.message}</div>}
      {messages.length > 0 && (
        <div className="bottom-composer">
          <Composer
            modelId={conversation.modelId}
            mode={conversation.mode}
            thinkingLevel={conversation.thinkingLevel}
            status={status}
            onModelChange={changeModel}
            onModeChange={(mode) => updateModelPreference({ mode })}
            onThinkingChange={(thinkingLevel) => updateModelPreference({ thinkingLevel })}
            onSubmit={handleSubmit}
            onStop={() => void stop()}
          />
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState('')
  const [theme, setTheme] = useState<ThemeName>('light')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [pendingRename, setPendingRename] = useState<Conversation | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null)
  const saveTimers = useRef(new Map<string, number>())
  const dirtyConversationIds = useRef(new Set<string>())
  const activeConversation = conversations.find((conversation) => conversation.id === activeId)

  useEffect(() => {
    let mounted = true
    loadConversations()
      .then((saved) => {
        if (!mounted) return
        const ordered = saved.sort((a, b) => b.updatedAt - a.updatedAt)
        if (ordered.length) {
          setConversations(ordered)
          setActiveId(ordered[0].id)
        } else {
          const first = createConversation()
          setConversations([first])
          setActiveId(first.id)
          void saveConversation(first).catch((error: unknown) => {
            setStorageError(error instanceof Error ? error.message : 'Could not save this chat.')
          })
        }
        try {
          const savedTheme = window.localStorage.getItem('chat-theme')
          if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme)
        } catch {
          setStorageError('Theme preference could not be loaded from this browser.')
        }
        setLoaded(true)
      })
      .catch((error: unknown) => {
        if (!mounted) return
        setStorageError(error instanceof Error ? error.message : 'Could not load saved chats.')
        const first = createConversation()
        setConversations([first])
        setActiveId(first.id)
        setLoaded(true)
      })
    return () => {
      mounted = false
      saveTimers.current.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const updateConversation = useCallback((id: string, patch: Partial<Conversation>) => {
    dirtyConversationIds.current.add(id)
    setConversations((current) => {
      const next = current.map((conversation) =>
        conversation.id === id ? { ...conversation, ...patch } : conversation,
      )
      return next.sort((a, b) => b.updatedAt - a.updatedAt)
    })
  }, [])

  useEffect(() => {
    if (!loaded) return
    for (const id of dirtyConversationIds.current) {
      const updated = conversations.find((conversation) => conversation.id === id)
      if (!updated) continue
      const previousTimer = saveTimers.current.get(id)
      if (previousTimer) window.clearTimeout(previousTimer)
      const timer = window.setTimeout(() => {
        void saveConversation(updated).catch((error: unknown) => {
          setStorageError(error instanceof Error ? error.message : 'Could not save this chat.')
        })
        saveTimers.current.delete(id)
      }, 350)
      saveTimers.current.set(id, timer)
    }
    dirtyConversationIds.current.clear()
  }, [conversations, loaded])

  const updateActiveConversation = useCallback((patch: Partial<Conversation>) => {
    if (activeId) updateConversation(activeId, patch)
  }, [activeId, updateConversation])

  const startNewChat = async () => {
    const conversation = createConversation()
    try {
      await saveConversation(conversation)
      setConversations((current) => [conversation, ...current])
      setActiveId(conversation.id)
      setStorageError('')
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Could not create a new chat.')
    }
  }

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
    try {
      window.localStorage.setItem('chat-theme', nextTheme)
      setStorageError('')
    } catch {
      setStorageError('Theme preference could not be saved in this browser.')
    }
  }

  const openRename = (conversation: Conversation) => {
    setRenameValue(conversation.title)
    setPendingRename(conversation)
    setDialog('rename')
  }

  const renameConversation = () => {
    if (!pendingRename || !renameValue.trim()) return
    updateConversation(pendingRename.id, { title: renameValue.trim().slice(0, 80) })
    setPendingRename(null)
    setDialog(null)
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      const pendingTimer = saveTimers.current.get(pendingDelete.id)
      if (pendingTimer) window.clearTimeout(pendingTimer)
      saveTimers.current.delete(pendingDelete.id)
      dirtyConversationIds.current.delete(pendingDelete.id)
      await removeConversation(pendingDelete.id)
      const remaining = conversations.filter((conversation) => conversation.id !== pendingDelete.id)
      if (remaining.length) {
        setConversations(remaining)
        if (activeId === pendingDelete.id) setActiveId(remaining[0].id)
      } else {
        const next = createConversation()
        await saveConversation(next)
        setConversations([next])
        setActiveId(next.id)
      }
      setStorageError('')
      setPendingDelete(null)
      setDialog(null)
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Could not delete this chat.')
    }
  }

  return (
    <FluentProvider theme={theme === 'dark' ? webDarkTheme : webLightTheme}>
      <main className={`app-shell ${theme === 'dark' ? 'theme-dark' : ''}`}>
        <aside className={`sidebar ${sidebarOpen ? '' : 'sidebar-collapsed'}`} aria-label="Chat history">
          <div className="sidebar-header">
            {sidebarOpen && <span className="brand-wordmark">Companion</span>}
            <Tooltip content={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'} relationship="label">
              <Button
                appearance="subtle"
                icon={sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                onClick={() => setSidebarOpen((open) => !open)}
              />
            </Tooltip>
          </div>
          {sidebarOpen && (
            <>
              <Button
                className="new-chat-button"
                appearance="subtle"
                icon={<Plus size={17} />}
                onClick={() => void startNewChat()}
              >
                New chat
              </Button>
              <div className="history-heading">Recent</div>
              <nav className="conversation-history">
                {conversations.map((conversation) => (
                  <div
                    className={`history-item ${activeId === conversation.id ? 'history-item-active' : ''}`}
                    key={conversation.id}
                  >
                    <button
                      className="history-open"
                      type="button"
                      onClick={() => setActiveId(conversation.id)}
                      aria-current={activeId === conversation.id ? 'page' : undefined}
                    >
                      <MessageSquare size={15} />
                      <span className="history-title">{conversation.title}</span>
                      <span className="history-time">{formatUpdatedAt(conversation.updatedAt)}</span>
                    </button>
                    <Menu>
                      <MenuTrigger disableButtonEnhancement>
                        <Button
                          appearance="subtle"
                          size="small"
                          className="history-more"
                          icon={<MoreHorizontal size={16} />}
                          aria-label={`Options for ${conversation.title}`}
                        />
                      </MenuTrigger>
                      <MenuPopover>
                        <MenuList>
                          <MenuItem icon={<Pencil size={15} />} onClick={() => openRename(conversation)}>
                            Rename
                          </MenuItem>
                          <MenuItem
                            icon={<Trash2 size={15} />}
                            onClick={() => {
                              setPendingDelete(conversation)
                              setDialog('delete')
                            }}
                          >
                            Delete
                          </MenuItem>
                        </MenuList>
                      </MenuPopover>
                    </Menu>
                  </div>
                ))}
                {!loaded && <div className="history-loading">Loading your chats…</div>}
              </nav>
              <div className="sidebar-spacer" />
              <div className="sidebar-footer">
                <div className="sidebar-model">
                  <ModelLogo modelId={activeConversation?.modelId ?? defaultModelId} />
                  <span>{activeConversation ? models.find((model) => model.id === activeConversation.modelId)?.name : 'Cloudflare AI'}</span>
                </div>
                <Tooltip content={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} relationship="label">
                  <Button
                    appearance="subtle"
                    icon={theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
                    aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
                    onClick={toggleTheme}
                  />
                </Tooltip>
              </div>
            </>
          )}
          {!sidebarOpen && (
            <div className="collapsed-actions">
              <Tooltip content="New chat" relationship="label">
                <Button appearance="subtle" icon={<Plus size={18} />} aria-label="New chat" onClick={() => void startNewChat()} />
              </Tooltip>
              <Tooltip content="Chat history" relationship="label">
                <Button appearance="subtle" icon={<MenuIcon size={18} />} aria-label="Expand chat history" onClick={() => setSidebarOpen(true)} />
              </Tooltip>
              <Tooltip content={theme === 'light' ? 'Dark theme' : 'Light theme'} relationship="label">
                <Button appearance="subtle" icon={theme === 'light' ? <Moon size={18} /> : <Sun size={18} />} aria-label="Toggle theme" onClick={toggleTheme} />
              </Tooltip>
            </div>
          )}
        </aside>
        <section className="main-panel">
          {loaded && activeConversation ? (
            <ChatSession
              key={activeConversation.id}
              conversation={activeConversation}
              theme={theme}
              onUpdate={updateActiveConversation}
            />
          ) : (
            <div className="loading-view">Preparing your chat…</div>
          )}
          {storageError && <div className="storage-toast" role="status">{storageError}</div>}
        </section>
        <Dialog open={dialog === 'rename'} onOpenChange={(_, data) => !data.open && setDialog(null)}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Rename conversation</DialogTitle>
              <DialogContent>
                <Input
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.currentTarget.value)}
                  aria-label="Conversation name"
                  maxLength={80}
                  autoFocus
                />
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setDialog(null)}>Cancel</Button>
                <Button appearance="primary" onClick={renameConversation} disabled={!renameValue.trim()}>Save</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
        <Dialog open={dialog === 'delete'} onOpenChange={(_, data) => !data.open && setDialog(null)}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Delete this conversation?</DialogTitle>
              <DialogContent>
                “{pendingDelete?.title}” and its messages will be removed from this device.
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setDialog(null)}>Cancel</Button>
                <Button appearance="primary" icon={<Trash2 size={15} />} onClick={() => void confirmDelete()}>Delete</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      </main>
    </FluentProvider>
  )
}
