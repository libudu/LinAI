import { hc } from 'hono/client'
import { useEffect, useRef, useState } from 'react'
import type { AppType } from '../../../server/index'

const client = hc<AppType>('/')

interface LogViewerProps {
  moduleId: string // e.g., 'trae'
  title?: string
}

export function LogViewer({ moduleId, title = '系统日志' }: LogViewerProps) {
  const [logs, setLogs] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const clearLogs = async () => {
    try {
      const res = await client.api.log[':moduleId'].$delete({
        param: { moduleId },
      })
      if (res.ok) {
        setLogs([])
      }
    } catch (err) {
      console.error('Failed to clear logs:', err)
    }
  }

  useEffect(() => {
    // Connect to SSE endpoint
    const eventSource = new EventSource(`/api/log/${moduleId}`)

    eventSource.addEventListener('log', (e) => {
      setLogs((prev) => {
        const newLogs = [...prev, e.data]
        // Keep only last 100 logs in memory to prevent performance issues
        if (newLogs.length > 100) {
          return newLogs.slice(newLogs.length - 100)
        }
        return newLogs
      })
    })

    eventSource.onerror = (err) => {
      console.error(`SSE error for ${moduleId}:`, err)
    }

    return () => {
      eventSource.close()
    }
  }, [moduleId])

  useEffect(() => {
    // Auto scroll to bottom
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-4 py-2">
        <span className="font-mono text-sm text-slate-200">{title}</span>
        <span className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
          </span>
          <span className="font-mono text-xs text-green-500">Connected</span>
          <button
            onClick={clearLogs}
            className="flex items-center rounded border border-slate-600 bg-slate-700 px-2 py-0.5 text-[12px] text-slate-400 transition-colors hover:bg-slate-600 hover:text-slate-200"
          >
            清空
          </button>
        </span>
      </div>
      <div
        ref={scrollRef}
        className="h-[300px] space-y-1 overflow-y-auto p-4 font-mono text-xs text-slate-300"
      >
        {logs.length === 0 ? (
          <div className="text-slate-500 italic">等待日志输出...</div>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              className="rounded px-1 break-all whitespace-pre-wrap hover:bg-slate-800"
            >
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
