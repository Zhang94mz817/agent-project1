import type { ConnectionStatus } from '../types'

interface Props {
  status: ConnectionStatus
  sessionId: string
}

export function StatusSection({ status, sessionId }: Props) {
  return (
    <div className="sidebar-section">
      <h3>连接状态</h3>
      <div className="status-item">
        <span className="label">
          <span className={`connection-dot ${status}`} />
          <span>
            {status === 'connected' ? '已连接' : status === 'disconnected' ? '已断开' : '连接中...'}
          </span>
        </span>
        <span className="value small" title={sessionId}>{sessionId || '-'}</span>
      </div>
    </div>
  )
}
