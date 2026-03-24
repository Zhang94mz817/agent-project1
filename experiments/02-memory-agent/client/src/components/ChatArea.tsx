import type { ChatItem, SendFn } from '../types'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'

interface Props {
  chatItems: ChatItem[]
  busy: boolean
  send: SendFn
}

export function ChatArea({ chatItems, busy, send }: Props) {
  function handleSend(text: string) {
    send({ type: 'chat', content: text })
  }

  return (
    <div className="main">
      <div className="chat-header">
        <span>对话</span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>claude-sonnet-4.5</span>
      </div>
      <MessageList chatItems={chatItems} />
      <ChatInput busy={busy} onSend={handleSend} />
    </div>
  )
}
