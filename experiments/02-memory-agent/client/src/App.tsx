import { useWebSocket } from './hooks/useWebSocket'
import { Sidebar } from './components/Sidebar'
import { ChatArea } from './components/ChatArea'
import './index.css'

export function App() {
  const ws = useWebSocket()
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar {...ws} />
      <ChatArea chatItems={ws.chatItems} busy={ws.busy} send={ws.send} />
    </div>
  )
}
