import { useRef, useEffect, useState } from 'react'

interface Props {
  busy: boolean
  onSend: (text: string) => void
}

export function ChatInput({ busy, onSend }: Props) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [value])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    const text = value.trim()
    if (!text || busy) return
    setValue('')
    onSend(text)
  }

  return (
    <div className="input-area">
      <div className="input-container">
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            id="input"
            rows={1}
            placeholder="输入消息..."
            autoFocus
            disabled={busy}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          id="send-btn"
          title="发送"
          disabled={busy}
          onClick={handleSend}
        >
          &#8593;
        </button>
      </div>
    </div>
  )
}
