import type { MemoryFact } from '../types'
import { MemoryCard } from './MemoryCard'
import { explainUserFact, explainProjectFact } from '../utils/formatters'

interface Props {
  userFacts: MemoryFact[]
  projectFacts: MemoryFact[]
}

export function MemorySection({ userFacts, projectFacts }: Props) {
  return (
    <div className="sidebar-section">
      <h3>长期记忆</h3>

      <div className="status-item">
        <span className="label">用户长期记忆</span>
        <span className="value small">{userFacts.length}</span>
      </div>
      <div className="memory-help">
        点击下面的条目可以查看这条用户记忆记录了什么，以及它来自哪里。
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
        <span className="label">项目长期记忆</span>
        <span className="value">{projectFacts.length}</span>
      </div>
      <div className="memory-help">
        点击下面的条目可以查看这条项目记忆记录了什么，以及它来自哪里。
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
  )
}
