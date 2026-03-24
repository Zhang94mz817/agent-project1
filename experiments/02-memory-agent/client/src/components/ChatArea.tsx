import type { ChatItem, SendFn } from '../types'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'

interface Props {
  chatItems: ChatItem[]
  busy: boolean
  send: SendFn
  onToggleSidebar: () => void
}

export function ChatArea({ chatItems, busy, send, onToggleSidebar }: Props) {
  function handleSend(text: string) {
    send({ type: 'chat', content: text })
  }

  return (
    <div className="main">
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="sidebar-toggle" onClick={onToggleSidebar} title="切换侧边栏">☰</button>
          <span>对话</span>
        </div>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>claude-sonnet-4.5</span>
      </div>
      <MessageList chatItems={chatItems} />
      <ChatInput busy={busy} onSend={handleSend} />
    </div>
  )
}
