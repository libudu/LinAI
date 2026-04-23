import { useEffect, useState, useRef } from 'react'
import { hc } from 'hono/client'
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
        param: { moduleId }
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
    <div className="flex flex-col bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
      <div className="bg-slate-800 px-4 py-2 flex justify-between items-center border-b border-slate-700">
        <span className="text-slate-200 font-mono text-sm">{title}</span>
        <span className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-green-500 text-xs font-mono">Connected</span>
          <button
            onClick={clearLogs}
            className="text-[12px] px-2 py-0.5 flex items-center bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200 rounded border border-slate-600 transition-colors"
          >
            清空
          </button>
        </span>
      </div>
      <div
        ref={scrollRef}
        className="p-4 overflow-y-auto font-mono text-xs text-slate-300 space-y-1 h-[300px]"
      >
        {logs.length === 0 ? (
          <div className="text-slate-500 italic">等待日志输出...</div>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              className="break-all whitespace-pre-wrap hover:bg-slate-800 px-1 rounded"
            >
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
