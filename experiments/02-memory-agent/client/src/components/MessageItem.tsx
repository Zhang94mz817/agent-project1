import { renderMarkdown } from '../utils/markdown'

interface Props {
  role: 'user' | 'assistant'
  content: string
}

export function MessageItem({ role, content }: Props) {
  return (
    <div className="message">
      <div className={`msg-role ${role}`}>{role === 'user' ? '你' : 'Agent'}</div>
      <div
        className="msg-content"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />
    </div>
  )
}
