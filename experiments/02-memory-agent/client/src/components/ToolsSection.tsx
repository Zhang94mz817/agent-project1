import type { Tool, SendFn } from '../types'

interface Props {
  tools: Tool[]
  send: SendFn
}

const MEMORY_SKILLS = new Set(['memory_upsert', 'memory_query'])
const CAPABILITY_ICONS: Record<string, string> = {
  get_current_time: '🕐',
  calculator: '🔢',
  read_file: '📄',
  web_fetch: '🌐',
}

export function ToolsSection({ tools, send }: Props) {
  const memoryTools = tools.filter((t) => MEMORY_SKILLS.has(t.name))
  const capTools = tools.filter((t) => !MEMORY_SKILLS.has(t.name))

  return (
    <>
      <div className="sidebar-section">
        <h3>记忆 Skills</h3>
        <div>
          {memoryTools.map((tool) => (
            <div key={tool.name} className="skill-item">
              <div className="skill-info">
                <div className="skill-name">{tool.name}</div>
                <div className="skill-desc">
                  {tool.description.length > 60
                    ? tool.description.slice(0, 60) + '…'
                    : tool.description}
                </div>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  defaultChecked
                  onChange={(e) =>
                    send({ type: 'set_tool_enabled', name: tool.name, enabled: e.target.checked })
                  }
                />
                <span className="toggle-track" />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <h3>能力</h3>
        <div>
          {capTools.map((tool) => (
            <div key={tool.name} className="tool-item">
              <div className="tool-icon">{CAPABILITY_ICONS[tool.name] || '🔧'}</div>
              <div>
                <div className="tool-name">{tool.name}</div>
                <div className="tool-desc">{tool.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
