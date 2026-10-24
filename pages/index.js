
<div
  style={{
    width: '100%',
    maxWidth: 768,
    margin: '0 auto',
  }}
>
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
      minHeight: 52,
      padding: '5px 10px',
      border: `1px solid ${theme.border}`,
      borderRadius: 28,
      background: theme.composer,
      boxSizing: 'border-box',
      transition:
        'background-color 300ms ease, border-color 300ms ease',
    }}
  >
    {/* Hidden file picker */}
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

    {/* Upload button: inside the prompt, on the left */}
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      disabled={loading || attachments.length >= MAX_FILES}
      aria-label="Attach files or images"
      title="Attach files or images"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        width: 30,
        height: 36,
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: theme.text,
        fontSize: 27,
        fontWeight: 300,
        lineHeight: 1,
        cursor:
          loading || attachments.length >= MAX_FILES
            ? 'not-allowed'
            : 'pointer',
        opacity:
          loading || attachments.length >= MAX_FILES ? 0.4 : 1,
      }}
    >
      +
    </button>

    {/* Compact prompt: one line initially, two when text wraps */}
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
        maxHeight: 66,
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
      }}
    />

    {/* Outlined triangle: inside the prompt, on the right */}
    <button
      type="button"
      onClick={sendMessage}
      disabled={!canSend}
      aria-label="Send message"
      title="Send message"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        width: 32,
        height: 36,
        padding: 0,
        border: 'none',
        borderRadius: 0,
        background: 'transparent',
        color: theme.text,
        opacity: canSend ? 1 : 0.4,
        cursor: canSend ? 'pointer' : 'not-allowed',
        transition: 'opacity 180ms ease, color 250ms ease',
      }}
    >
      <SendTriangle color={theme.text} />
    </button>
  </div>

  {/* Attachment previews appear only when files are selected */}
  {attachments.length > 0 && (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        marginTop: 10,
      }}
    >
      {attachments.map((file) => (
        <div
          key={file.id}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            maxWidth: 220,
            padding: 7,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            color: theme.muted,
            fontSize: 12,
          }}
        >
          {file.kind === 'image' ? (
            <img
              src={file.dataUrl}
              alt={file.name}
              style={{
                width: 42,
                height: 42,
                objectFit: 'cover',
                borderRadius: 6,
              }}
            />
          ) : (
            <span aria-hidden="true">▤</span>
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

          <button
            type="button"
            onClick={() => removeAttachment(file.id)}
            aria-label={`Remove ${file.name}`}
            style={{
              border: 'none',
              background: 'transparent',
              color: theme.text,
              cursor: 'pointer',
              padding: 2,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )}

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
