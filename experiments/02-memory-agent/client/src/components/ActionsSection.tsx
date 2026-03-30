import type { SendFn } from '../types'

interface Props {
  busy: boolean
  send: SendFn
}

export function ActionsSection({ busy, send }: Props) {
  function handleSummarize() {
    send({ type: 'force_summarize' })
  }

  function handleClear() {
    if (confirm('确定要清除当前浏览器会话的 session 历史吗？user/project memory 会保留。')) {
      send({ type: 'clear_memory' })
    }
  }

  return (
    <div className="sidebar-section">
      <button
        className="btn btn-summarize"
        style={{ marginBottom: '8px' }}
        disabled={busy}
        onClick={handleSummarize}
      >
        立即压缩会话
      </button>
      <div className="sidebar-actions" style={{ padding: 0 }}>
        <button className="btn btn-danger" onClick={handleClear}>
          清除当前 Session
        </button>
      </div>
    </div>
  )
}
