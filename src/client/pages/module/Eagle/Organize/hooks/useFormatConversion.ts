import { ApiError } from '@/client/service/http'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { convertEagleHeif, fetchConversionCandidates } from '../../api'
import { useEagleConfig } from '../../settings/useEagleConfig'

type Candidates = Awaited<ReturnType<typeof fetchConversionCandidates>>
type Candidate = Candidates['snapshotItems'][number]
export type ConversionFailure = Candidate & {
  error: string
  committed: boolean
}
const PAGE_SIZE = 50

/** 队列仅存在本次弹窗内；关闭/切库后只让当前请求完成，不再派发下一张。 */
export function useFormatConversion(open: boolean, onConverted: () => void) {
  const libraryPath = useEagleConfig((state) => state.libraryPath)
  const [page, setPage] = useState(1)
  const pageRef = useRef(page)
  pageRef.current = page
  const [data, setData] = useState<Candidates | null>(null)
  const [loading, setLoading] = useState(false)
  const [queryError, setQueryError] = useState('')
  const [failures, setFailures] = useState<Record<string, ConversionFailure>>(
    {},
  )
  const [progress, setProgress] = useState({
    total: 0,
    completed: 0,
    succeeded: 0,
    failed: 0,
  })
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const session = useRef({
    active: false,
    stop: false,
    busy: false,
    libraryPath,
  })
  const querySequence = useRef(0)
  const openRef = useRef(open)
  openRef.current = open
  const onConvertedRef = useRef(onConverted)
  onConvertedRef.current = onConverted
  const alive = (current: typeof session.current) =>
    current.active &&
    openRef.current &&
    session.current === current &&
    useEagleConfig.getState().libraryPath === current.libraryPath

  // 同步清理会话，避免关闭提交后、被动 effect 清理前的响应派发下一张。
  useLayoutEffect(() => {
    const current = { active: open, stop: false, busy: false, libraryPath }
    session.current = current
    setPage(1)
    setData(null)
    setFailures({})
    setProgress({ total: 0, completed: 0, succeeded: 0, failed: 0 })
    setRunning(false)
    setStopping(false)
    setCurrentId(null)
    return () => {
      current.active = false
      current.stop = true
      querySequence.current++
    }
  }, [open, libraryPath])

  const load = useCallback(async (targetPage: number) => {
    const current = session.current
    if (!alive(current)) return
    const sequence = ++querySequence.current
    setLoading(true)
    setQueryError('')
    try {
      const next = await fetchConversionCandidates(
        (targetPage - 1) * PAGE_SIZE,
        PAGE_SIZE,
      )
      if (!alive(current) || sequence !== querySequence.current) return
      const lastPage = Math.max(1, Math.ceil(next.total / PAGE_SIZE))
      if (targetPage > lastPage) {
        setPage(lastPage)
        return
      }
      setData(next)
    } catch (error) {
      if (alive(current) && sequence === querySequence.current)
        setQueryError(
          error instanceof Error ? error.message : '查询待转换图片失败',
        )
    } finally {
      if (alive(current) && sequence === querySequence.current)
        setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(page)
  }, [page, open, libraryPath, load])

  const run = async (mode: 'all' | 'failed' | Candidate) => {
    const current = session.current
    if (!alive(current) || current.busy || !data?.libraryId) return
    current.busy = true
    current.stop = false
    setRunning(true)
    setStopping(false)
    setQueryError('')
    setProgress({ total: 0, completed: 0, succeeded: 0, failed: 0 })
    const boundId = data.libraryId
    try {
      let queue: Candidate[]
      if (mode === 'all') {
        const snapshot = await fetchConversionCandidates(0, PAGE_SIZE, true)
        if (!alive(current) || current.stop) return
        if (snapshot.libraryId !== boundId)
          throw new Error('资源库已切换，请重新查询')
        queue = snapshot.snapshotItems
      } else queue = mode === 'failed' ? Object.values(failures) : [mode]
      if (!alive(current) || current.stop) return
      setProgress({
        total: queue.length,
        completed: 0,
        succeeded: 0,
        failed: 0,
      })
      for (const item of queue) {
        if (!alive(current) || current.stop) break
        setCurrentId(item.id)
        let successful = false
        try {
          const result = await convertEagleHeif(item.id, boundId)
          if (!alive(current)) return
          onConvertedRef.current()
          successful = result.sourceRemoved
          setFailures((previous) => {
            const next = { ...previous }
            if (result.warning)
              next[item.id] = {
                ...item,
                contentVersion: result.item.contentVersion,
                error: result.warning,
                committed: true,
              }
            else delete next[item.id]
            return next
          })
          // 每张提交后补拉分页，成功条目立即退出候选。
          await load(pageRef.current)
        } catch (error) {
          if (!alive(current)) return
          setFailures((previous) => ({
            ...previous,
            [item.id]: {
              ...item,
              error: error instanceof Error ? error.message : '转换失败',
              committed: false,
            },
          }))
          if (error instanceof ApiError && error.code === 'LIBRARY_CHANGED')
            current.stop = true
          else await load(pageRef.current)
        }
        if (!alive(current)) return
        setProgress((previous) => ({
          ...previous,
          completed: previous.completed + 1,
          succeeded: previous.succeeded + (successful ? 1 : 0),
          failed: previous.failed + (successful ? 0 : 1),
        }))
      }
    } catch (error) {
      if (alive(current))
        setQueryError(
          error instanceof Error ? error.message : '获取全库候选失败',
        )
    } finally {
      current.busy = false
      if (alive(current)) {
        setRunning(false)
        setStopping(false)
        setCurrentId(null)
      }
    }
  }

  const stop = () => {
    session.current.stop = true
    setStopping(true)
  }
  return {
    page,
    setPage,
    pageSize: PAGE_SIZE,
    data,
    loading,
    queryError,
    failures,
    progress,
    running,
    stopping,
    currentId,
    run,
    stop,
    reload: () => load(page),
  }
}
