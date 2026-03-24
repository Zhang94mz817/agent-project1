// ---- Server → Client message types ----

export interface SessionReadyMsg {
  type: 'session_ready'
  sessionId: string
}

export interface MemoryFact {
  key: string
  value: string
  source?: string
  confidence?: string
  updatedAt?: string
}

export interface MemoryStatus {
  count: number
  summarizedMessageCount: number
  summary: string
  userFactCount: number
  userFacts: MemoryFact[]
  projectFactCount: number
  projectFacts: MemoryFact[]
  sessionId?: string
}

export interface MemoryStatusMsg extends MemoryStatus {
  type: 'memory_status'
}

export interface Tool {
  name: string
  description: string
}

export interface ToolsListMsg {
  type: 'tools_list'
  tools: Tool[]
}

export interface HistoryMsg {
  type: 'history'
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface UserEchoMsg {
  type: 'user_echo'
  content: string
}

export interface ThinkingMsg {
  type: 'thinking'
}

export interface ToolCallMsg {
  type: 'tool_call'
  name: string
  input: Record<string, unknown>
}

export interface ToolResultMsg {
  type: 'tool_result'
  name: string
  result: string
}

export interface AnswerMsg {
  type: 'answer'
  content: string
}

export interface ErrorMsg {
  type: 'error'
  message: string
}

export interface ForceSummarizeResultMsg {
  type: 'force_summarize_result'
  summarized: number
  summary: string
}

export interface MemoryClearedMsg {
  type: 'memory_cleared'
}

export type ServerMessage =
  | SessionReadyMsg
  | MemoryStatusMsg
  | ToolsListMsg
  | HistoryMsg
  | UserEchoMsg
  | ThinkingMsg
  | ToolCallMsg
  | ToolResultMsg
  | AnswerMsg
  | ErrorMsg
  | ForceSummarizeResultMsg
  | MemoryClearedMsg

// ---- Client → Server message types ----

export interface ChatClientMsg {
  type: 'chat'
  content: string
}

export interface SetToolEnabledClientMsg {
  type: 'set_tool_enabled'
  name: string
  enabled: boolean
}

export interface ForceSummarizeClientMsg {
  type: 'force_summarize'
}

export interface ClearMemoryClientMsg {
  type: 'clear_memory'
}

export type ClientMessage =
  | ChatClientMsg
  | SetToolEnabledClientMsg
  | ForceSummarizeClientMsg
  | ClearMemoryClientMsg

// ---- Chat item types for UI state ----

export interface ChatMessageItem {
  kind: 'message'
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface ToolCallState {
  name: string
  input: Record<string, unknown>
  result: string | null
  status: 'running' | 'done'
}

export interface ToolPanelItem {
  kind: 'tool_panel'
  id: string
  calls: ToolCallState[]
}

export interface ThinkingItem {
  kind: 'thinking'
  id: string
}

export interface SystemMessageItem {
  kind: 'system'
  id: string
  text: string
}

export interface ErrorItem {
  kind: 'error'
  id: string
  message: string
}

export type ChatItem =
  | ChatMessageItem
  | ToolPanelItem
  | ThinkingItem
  | SystemMessageItem
  | ErrorItem

// ---- Connection status ----

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

// ---- Hook return type ----

export type SendFn = (msg: ClientMessage) => void

export interface WebSocketState {
  status: ConnectionStatus
  sessionId: string
  memoryStatus: MemoryStatus
  tools: Tool[]
  chatItems: ChatItem[]
  busy: boolean
  currentToolPanelId: string | null
  send: SendFn
}
