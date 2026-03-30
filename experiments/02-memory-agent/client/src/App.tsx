import { useState } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { Sidebar } from './components/Sidebar'
import { ChatArea } from './components/ChatArea'
import './index.css'

export function App() {
  const ws = useWebSocket()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', width: '100vw' }}>
      <Sidebar {...ws} collapsed={!sidebarOpen} />
      <ChatArea
        chatItems={ws.chatItems}
        busy={ws.busy}
        send={ws.send}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />
    </div>
  )
}
