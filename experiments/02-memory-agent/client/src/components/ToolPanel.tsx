import { useState } from 'react'
import type { ToolCallState } from '../types'
import { formatInput } from '../utils/formatters'

interface Props {
  calls: ToolCallState[]
}

function ToolCallRow({ call }: { call: ToolCallState }) {
  const [open, setOpen] = useState(false)

  const resultText = call.result
    ? call.result.length > 500
      ? call.result.slice(0, 500) + '...'
      : call.result
    : '等待中...'

  return (
    <div className="tool-call">
      <div
        className={`tool-call-header${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="chevron">&#9654;</span>
        <span className="tool-tag">{call.name}</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
          {formatInput(call.input)}
        </span>
        <span className={`tool-status${call.status === 'done' ? ' done' : ' running'}`}>
          {call.status === 'done' ? '完成' : '运行中...'}
        </span>
      </div>
      <div className={`tool-call-body${open ? ' open' : ''}`}>
        <div className="label">参数</div>
        <pre>{JSON.stringify(call.input, null, 2)}</pre>
        <div className="label">结果</div>
        <pre>{resultText}</pre>
      </div>
    </div>
  )
}

export function ToolPanel({ calls }: Props) {
  return (
    <div className="tool-panel">
      {calls.map((call, i) => (
        <ToolCallRow key={`${call.name}-${i}`} call={call} />
      ))}
    </div>
  )
}
