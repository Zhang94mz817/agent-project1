import type { MemoryFact } from '../types'
import { formatDateTime } from '../utils/formatters'

interface Props {
  fact: MemoryFact
  explain: string
}

function confidenceClass(confidence: string | undefined): string {
  if (!confidence) return 'unknown'
  const c = confidence.toLowerCase()
  if (c === 'high') return 'high'
  if (c === 'medium') return 'medium'
  if (c === 'low') return 'low'
  return 'unknown'
}

export function MemoryCard({ fact, explain }: Props) {
  return (
    <details className="memory-item">
      <summary>
        <div className="memory-item-title">
          <div className="memory-item-key">{fact.key || '(unknown)'}</div>
          <div className="memory-item-value">{String(fact.value || '(空)')}</div>
        </div>
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0, alignItems: 'center' }}>
          <span className={`confidence-badge ${confidenceClass(fact.confidence)}`}>
            {fact.confidence || '?'}
          </span>
          {fact.source && (
            <span className="source-chip">{fact.source}</span>
          )}
          <span className="memory-item-arrow">▶</span>
        </div>
      </summary>
      <div className="memory-item-body">
        <div className="line"><strong>说明：</strong>{explain}</div>
        <div className="line"><strong>键：</strong><code>{fact.key || '(unknown)'}</code></div>
        <div className="line"><strong>值：</strong>{String(fact.value || '(空)')}</div>
        <div className="line"><strong>来源：</strong>{fact.source || '未知'}</div>
        <div className="line"><strong>置信度：</strong>{fact.confidence || '未知'}</div>
        <div className="line"><strong>最近更新：</strong>{formatDateTime(fact.updatedAt)}</div>
      </div>
    </details>
  )
}
