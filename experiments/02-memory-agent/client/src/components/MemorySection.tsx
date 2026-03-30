import { useState } from 'react'
import type { MemoryFact } from '../types'
import { MemoryCard } from './MemoryCard'
import { explainUserFact, explainProjectFact } from '../utils/formatters'

interface Props {
  userFacts: MemoryFact[]
  projectFacts: MemoryFact[]
}

export function MemorySection({ userFacts, projectFacts }: Props) {
  const [open, setOpen] = useState(false)
  const total = userFacts.length + projectFacts.length

  return (
    <div className={`sidebar-section sidebar-collapsible${open ? ' open' : ''}`}>
      <div
        className="sidebar-collapsible-header"
        onClick={() => setOpen((v) => !v)}
      >
        <h3>长期记忆</h3>
        <span className="sidebar-collapsible-badge">{total}</span>
        <span className="sidebar-collapsible-arrow">▶</span>
      </div>

      {open && (
        <div className="sidebar-collapsible-body">
          <div className="status-item">
            <span className="label">用户记忆</span>
            <span className="value small">{userFacts.length}</span>
          </div>
          <div className="memory-list">
            {userFacts.length === 0 ? (
              <div className="memory-empty">(暂无)</div>
            ) : (
              userFacts.map((f) => (
                <MemoryCard key={f.key} fact={f} explain={explainUserFact(f)} />
              ))
            )}
          </div>

          <div className="status-item" style={{ marginTop: '12px' }}>
            <span className="label">项目记忆</span>
            <span className="value">{projectFacts.length}</span>
          </div>
          <div className="memory-list">
            {projectFacts.length === 0 ? (
              <div className="memory-empty">(暂无)</div>
            ) : (
              projectFacts.map((f) => (
                <MemoryCard key={f.key} fact={f} explain={explainProjectFact(f)} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
