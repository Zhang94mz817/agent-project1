import { useReducer, useEffect, useRef, useCallback } from 'react'
import type {
  ChatItem,
  ChatMessageItem,
  ToolPanelItem,
  ThinkingItem,
  SystemMessageItem,
  ErrorItem,
  ConnectionStatus,
  MemoryStatus,
  Tool,
  ServerMessage,
  ClientMessage,
  WebSocketState,
  SendFn,
} from '../types'

interface State {
  status: ConnectionStatus
  sessionId: string
  memoryStatus: MemoryStatus
  tools: Tool[]
  chatItems: ChatItem[]
  busy: boolean
  currentToolPanelId: string | null
}

const defaultMemoryStatus: MemoryStatus = {
  count: 0,
  summarizedMessageCount: 0,
  summary: '',
  userFactCount: 0,
  userFacts: [],
  projectFactCount: 0,
  projectFacts: [],
}

const initialState: State = {
  status: 'connecting',
  sessionId: '',
  memoryStatus: defaultMemoryStatus,
  tools: [],
  chatItems: [],
  busy: false,
  currentToolPanelId: null,
}

type Action =
  | { type: 'SET_STATUS'; status: ConnectionStatus }
  | { type: 'SERVER_MSG'; msg: ServerMessage }

let itemCounter = 0
function makeId(prefix: string): string {
  return `${prefix}-${++itemCounter}`
}

function reducer(state: State, action: Action): State {
  if (action.type === 'SET_STATUS') {
    return { ...state, status: action.status }
  }

  if (action.type === 'SERVER_MSG') {
    const msg = action.msg
    switch (msg.type) {
      case 'session_ready':
        return { ...state, sessionId: msg.sessionId }

      case 'memory_status': {
        const { type: _t, ...rest } = msg
        return {
          ...state,
          memoryStatus: rest as MemoryStatus,
          sessionId: msg.sessionId ?? state.sessionId,
        }
      }

      case 'tools_list':
        return { ...state, tools: msg.tools }

      case 'history': {
        const chatItems: ChatItem[] = msg.messages.map((m) => ({
          kind: 'message' as const,
          id: makeId('msg'),
          role: m.role,
          content: m.content,
        } as ChatMessageItem))
        return { ...state, chatItems, currentToolPanelId: null }
      }

      case 'user_echo': {
        const item: ChatMessageItem = {
          kind: 'message',
          id: makeId('msg'),
          role: 'user',
          content: msg.content,
        }
        return {
          ...state,
          chatItems: [...state.chatItems, item],
          busy: true,
        }
      }

      case 'thinking': {
        // Remove any existing thinking item first, then add new one
        const withoutThinking = state.chatItems.filter((c) => c.kind !== 'thinking')
        const item: ThinkingItem = { kind: 'thinking', id: makeId('thinking') }
        return { ...state, chatItems: [...withoutThinking, item] }
      }

      case 'tool_call': {
        // Remove thinking if present
        const withoutThinking = state.chatItems.filter((c) => c.kind !== 'thinking')

        if (state.currentToolPanelId) {
          // Add to existing panel
          const updated = withoutThinking.map((c) => {
            if (c.kind === 'tool_panel' && c.id === state.currentToolPanelId) {
              const panel = c as ToolPanelItem
              return {
                ...panel,
                calls: [
                  ...panel.calls,
                  { name: msg.name, input: msg.input, result: null, status: 'running' as const },
                ],
              }
            }
            return c
          })
          return { ...state, chatItems: updated }
        } else {
          // Create new panel
          const panelId = makeId('panel')
          const panel: ToolPanelItem = {
            kind: 'tool_panel',
            id: panelId,
            calls: [{ name: msg.name, input: msg.input, result: null, status: 'running' }],
          }
          return {
            ...state,
            chatItems: [...withoutThinking, panel],
            currentToolPanelId: panelId,
          }
        }
      }

      case 'tool_result': {
        if (!state.currentToolPanelId) return state
        const updated = state.chatItems.map((c) => {
          if (c.kind === 'tool_panel' && c.id === state.currentToolPanelId) {
            const panel = c as ToolPanelItem
            // Find last running call with this name
            let replaced = false
            const calls = [...panel.calls].reverse().map((call) => {
              if (!replaced && call.name === msg.name && call.status === 'running') {
                replaced = true
                return { ...call, result: msg.result, status: 'done' as const }
              }
              return call
            }).reverse()
            return { ...panel, calls }
          }
          return c
        })
        return { ...state, chatItems: updated }
      }

      case 'answer': {
        const withoutThinking = state.chatItems.filter((c) => c.kind !== 'thinking')
        const item: ChatMessageItem = {
          kind: 'message',
          id: makeId('msg'),
          role: 'assistant',
          content: msg.content,
        }
        return {
          ...state,
          chatItems: [...withoutThinking, item],
          busy: false,
          currentToolPanelId: null,
        }
      }

      case 'error': {
        const withoutThinking = state.chatItems.filter((c) => c.kind !== 'thinking')
        const item: ErrorItem = {
          kind: 'error',
          id: makeId('error'),
          message: msg.message,
        }
        return {
          ...state,
          chatItems: [...withoutThinking, item],
          busy: false,
        }
      }

      case 'force_summarize_result': {
        const text =
          msg.summarized === 0
            ? '当前没有可压缩的消息。'
            : `📝 已压缩 ${msg.summarized} 条消息\n\n${msg.summary}`
        const item: SystemMessageItem = {
          kind: 'system',
          id: makeId('sys'),
          text,
        }
        return { ...state, chatItems: [...state.chatItems, item] }
      }

      case 'memory_cleared':
        return { ...state, chatItems: [], currentToolPanelId: null }

      default:
        return state
    }
  }

  return state
}

function getWsUrl(): string {
  const envUrl = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_WS_URL
  if (envUrl) return envUrl
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}`
}

export function useWebSocket(): WebSocketState {
  const [state, dispatch] = useReducer(reducer, initialState)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    dispatch({ type: 'SET_STATUS', status: 'connecting' })
    const ws = new WebSocket(getWsUrl())
    wsRef.current = ws

    ws.onopen = () => {
      dispatch({ type: 'SET_STATUS', status: 'connected' })
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    ws.onclose = () => {
      dispatch({ type: 'SET_STATUS', status: 'disconnected' })
      wsRef.current = null
      reconnectTimerRef.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      // error will be followed by close
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as ServerMessage
        dispatch({ type: 'SERVER_MSG', msg })
      } catch {
        // ignore malformed messages
      }
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  const send: SendFn = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }, [])

  return { ...state, send }
}
