import { useLayoutEffect, useRef } from 'react'
import type { ChatItem } from '../types'
import { MessageItem } from './MessageItem'
import { ToolPanel } from './ToolPanel'
import { ThinkingIndicator } from './ThinkingIndicator'
import { SystemMessage } from './SystemMessage'

interface Props {
  chatItems: ChatItem[]
}

export function MessageList({ chatItems }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatItems])

  return (
    <div className="messages">
      {chatItems.map((item) => {
        switch (item.kind) {
          case 'message':
            return <MessageItem key={item.id} role={item.role} content={item.content} />
          case 'tool_panel':
            return <ToolPanel key={item.id} calls={item.calls} />
          case 'thinking':
            return <ThinkingIndicator key={item.id} />
          case 'system':
            return <SystemMessage key={item.id} text={item.text} />
          case 'error':
            return (
              <div key={item.id} className="message">
                <div className="msg-role" style={{ color: 'var(--error)' }}>错误</div>
                <div className="msg-content" style={{ color: 'var(--error)' }}>{item.message}</div>
              </div>
            )
          default:
            return null
        }
      })}
      <div ref={bottomRef} />
    </div>
  )
}
