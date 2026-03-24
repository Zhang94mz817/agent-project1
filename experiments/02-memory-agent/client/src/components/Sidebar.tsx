import type { WebSocketState } from '../types'
import { StatusSection } from './StatusSection'
import { MemorySection } from './MemorySection'
import { ToolsSection } from './ToolsSection'
import { ActionsSection } from './ActionsSection'

type Props = WebSocketState

export function Sidebar({
  status,
  sessionId,
  memoryStatus,
  tools,
  busy,
  send,
}: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>Memory Agent</h1>
        <div className="subtitle">实验 02 — 分层记忆 + 会话隔离</div>
      </div>

      <StatusSection status={status} sessionId={sessionId} />

      <div className="sidebar-section">
        <h3>当前 Session</h3>
        <div className="status-item">
          <span className="label">消息数</span>
          <span className="value">{memoryStatus.count}</span>
        </div>
        <div className="status-item">
          <span className="label">已摘要条数</span>
          <span className="value">{memoryStatus.summarizedMessageCount || 0}</span>
        </div>
        <div className="status-item">
          <span className="label">摘要</span>
          <span className="value small" title={memoryStatus.summary}>
            {memoryStatus.summary || '(无)'}
          </span>
        </div>
      </div>

      <MemorySection
        userFacts={memoryStatus.userFacts || []}
        projectFacts={memoryStatus.projectFacts || []}
      />

      <ToolsSection tools={tools} send={send} />

      <ActionsSection busy={busy} send={send} />
    </aside>
  )
}
