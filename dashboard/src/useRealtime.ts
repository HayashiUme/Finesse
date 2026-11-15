import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isSnapshot } from './api'
import type { Connection } from './types'

export function useRealtime(connection: Connection | null, enabled: boolean) {
  const [live, setLive] = useState(false)
  const queryClient = useQueryClient()
  useEffect(() => {
    setLive(false)
    if (!enabled || !connection) return
    let disposed = false
    let socket: WebSocket | undefined
    let retry: number | undefined
    let watchdog: number | undefined
    const connect = () => {
      if (disposed) return
      socket = new WebSocket(`${connection.baseUrl.replace(/^http/, 'ws')}/api/v1/events?key=${encodeURIComponent(connection.apiKey)}`)
      const resetWatchdog = () => {
        window.clearTimeout(watchdog)
        watchdog = window.setTimeout(() => socket?.close(), 12000)
      }
      resetWatchdog()
      socket.onmessage = message => {
        if (disposed) return
        try {
          const event = JSON.parse(message.data)
          if (event.type === 'snapshot' && isSnapshot(event.data)) {
            setLive(true)
            resetWatchdog()
            queryClient.setQueryData(['snapshot', connection], event.data)
          }
        } catch { /* REST remains available if a server sends an invalid event. */ }
      }
      socket.onerror = () => socket?.close()
      socket.onclose = () => {
        window.clearTimeout(watchdog)
        if (!disposed) { setLive(false); retry = window.setTimeout(connect, 5000) }
      }
    }
    connect()
    return () => { disposed = true; window.clearTimeout(retry); window.clearTimeout(watchdog); socket?.close() }
  }, [connection, enabled, queryClient])
  return live
}
