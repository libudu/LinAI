import type { OrganizeStatus, OrganizeTaskView } from '@/shared/eagle/organize'
import { useEffect, useRef, useState } from 'react'
import { RefreshQueue } from '../../refreshQueue'
import { fetchOrganizeTask } from '../api'

/** 弹窗任务快照：仅打开、切轮次、阶段或队列总数变化时拉取。 */
export function useOrganizeTask(
  open: boolean,
  status: OrganizeStatus | null,
  loaded: boolean,
) {
  const [task, setTask] = useState<OrganizeTaskView | null>(null)
  const mountedRef = useRef(false)
  const contextRef = useRef({ open, createdAt: status?.createdAt })
  contextRef.current = { open, createdAt: status?.createdAt }
  const generationRef = useRef(0)
  const queueRef = useRef<RefreshQueue | null>(null)
  if (!queueRef.current) {
    queueRef.current = new RefreshQueue(async () => {
      const generation = generationRef.current
      const context = contextRef.current
      if (!mountedRef.current || !context.open) return
      try {
        const next = await fetchOrganizeTask()
        if (
          mountedRef.current &&
          generation === generationRef.current &&
          contextRef.current.open &&
          context.createdAt === contextRef.current.createdAt &&
          next?.createdAt === context.createdAt
        )
          setTask(next)
      } catch (error) {
        console.error('拉取整理任务详情失败', error)
      }
    })
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      generationRef.current++
    }
  }, [])

  useEffect(() => {
    generationRef.current++
    if (open && loaded) void queueRef.current!.request()
  }, [open, loaded, status?.createdAt, status?.phase, status?.total])

  return open && task?.createdAt === status?.createdAt ? task : null
}
