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
const CONVERSION_CONCURRENCY = 3

/** 队列仅存在本次弹窗内；关闭/切库后仅等待已发出的请求，不再派发。 */
export function useFormatConversion(open: boolean, onConverted: () => void) {
  const libraryPath = useEagleConfig((state) => state.libraryPath)
  const [page, setPage] = useState(1)
  const pageRef = useRef(page)
  pageRef.current = page
  const loadedPageRef = useRef<number | null>(null)
  const [data, setData] = useState<Candidates | null>(null)
  const [availableAtOpen, setAvailableAtOpen] = useState<boolean | null>(null)
  const [batchCandidates, setBatchCandidates] = useState<Candidate[] | null>(
    null,
  )
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
  const [activeIds, setActiveIds] = useState<string[]>([])
  const session = useRef({
    active: false,
    stop: false,
    busy: false,
    availabilityChecked: false,
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
    const current = {
      active: open,
      stop: false,
      busy: false,
      availabilityChecked: false,
      libraryPath,
    }
    session.current = current
    setPage(1)
    loadedPageRef.current = null
    setData(null)
    setAvailableAtOpen(null)
    setBatchCandidates(null)
    setFailures({})
    setProgress({ total: 0, completed: 0, succeeded: 0, failed: 0 })
    setRunning(false)
    setStopping(false)
    setActiveIds([])
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
      let next = await fetchConversionCandidates(
        (targetPage - 1) * PAGE_SIZE,
        PAGE_SIZE,
      )
      if (!alive(current) || sequence !== querySequence.current) return
      // 只按本次打开时的查询决定入口；转换后仍可查看进度、失败及源图保留结果。
      if (!current.availabilityChecked) {
        current.availabilityChecked = true
        setAvailableAtOpen(next.total > 0)
      }
      const lastPage = Math.max(1, Math.ceil(next.total / PAGE_SIZE))
      if (targetPage > lastPage) {
        next = await fetchConversionCandidates(
          (lastPage - 1) * PAGE_SIZE,
          PAGE_SIZE,
        )
        if (!alive(current) || sequence !== querySequence.current) return
        setPage(lastPage)
      }
      loadedPageRef.current = Math.min(targetPage, lastPage)
      setData(next)
    } catch (error) {
      if (alive(current) && sequence === querySequence.current) {
        // 查询失败不能当作无候选，保留入口供用户查看错误并重试。
        if (!current.availabilityChecked) {
          current.availabilityChecked = true
          setAvailableAtOpen(true)
        }
        setQueryError(
          error instanceof Error ? error.message : '查询待转换图片失败',
        )
      }
    } finally {
      if (alive(current) && sequence === querySequence.current)
        setLoading(false)
    }
  }, [])

  useEffect(() => {
    // 批量期间分页来自启动快照；页码收缩不能触发每张完成后的请求。
    if (!session.current.busy && loadedPageRef.current !== page) void load(page)
  }, [page, open, libraryPath, load])

  useEffect(() => {
    if (batchCandidates) {
      const lastPage = Math.max(
        1,
        Math.ceil(batchCandidates.length / PAGE_SIZE),
      )
      if (page > lastPage) setPage(lastPage)
    }
  }, [batchCandidates, page])

  const run = async (mode: 'all' | 'failed' | Candidate) => {
    const current = session.current
    if (!alive(current) || current.busy || !data?.libraryId) return
    current.busy = true
    current.stop = false
    // 失效运行前未返回的分页请求，避免覆盖本地更新的候选数量与列表。
    querySequence.current++
    setLoading(false)
    setRunning(true)
    setStopping(false)
    setQueryError('')
    setProgress({ total: 0, completed: 0, succeeded: 0, failed: 0 })
    const boundId = data.libraryId
    let dispatched = 0
    try {
      let queue: Candidate[]
      if (mode === 'all') {
        const snapshot = await fetchConversionCandidates(0, PAGE_SIZE, true)
        if (!alive(current) || current.stop) return
        if (snapshot.libraryId !== boundId)
          throw new Error('资源库已切换，请重新查询')
        queue = snapshot.snapshotItems
        setBatchCandidates(queue)
        setData((previous) =>
          previous
            ? {
                ...previous,
                total: snapshot.total,
                items: snapshot.total === 0 ? [] : previous.items,
              }
            : previous,
        )
      } else queue = mode === 'failed' ? Object.values(failures) : [mode]
      if (!alive(current) || current.stop) return
      setProgress({
        total: queue.length,
        completed: 0,
        succeeded: 0,
        failed: 0,
      })
      const execute = async (item: Candidate) => {
        dispatched++
        setActiveIds((previous) => [...previous, item.id])
        let successful = false
        try {
          const result = await convertEagleHeif(item.id, boundId)
          if (!alive(current)) return
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
          // 已提交 WebP（含源图保留警告）直接移出本地候选，不逐张重拉分页。
          setBatchCandidates(
            (previous) =>
              previous?.filter((candidate) => candidate.id !== item.id) ?? null,
          )
          const wasCandidate = !failures[item.id]?.committed
          setData((previous) =>
            previous?.libraryId === boundId
              ? {
                  ...previous,
                  total: Math.max(0, previous.total - (wasCandidate ? 1 : 0)),
                  items: previous.items.filter(
                    (candidate) => candidate.id !== item.id,
                  ),
                }
              : previous,
          )
        } catch (error) {
          if (!alive(current)) return
          setFailures((previous) => ({
            ...previous,
            [item.id]: {
              ...item,
              error: error instanceof Error ? error.message : '转换失败',
              committed: failures[item.id]?.committed ?? false,
            },
          }))
          if (error instanceof ApiError && error.code === 'LIBRARY_CHANGED')
            current.stop = true
        } finally {
          if (alive(current)) {
            setActiveIds((previous) => previous.filter((id) => id !== item.id))
            setProgress((previous) => ({
              ...previous,
              completed: previous.completed + 1,
              succeeded: previous.succeeded + (successful ? 1 : 0),
              failed: previous.failed + (successful ? 0 : 1),
            }))
          }
        }
      }
      // 前端短队列共用游标，保留原目录派发顺序；提交仍由后端库写锁串行保护。
      let cursor = 0
      await Promise.allSettled(
        Array.from(
          { length: Math.min(CONVERSION_CONCURRENCY, queue.length) },
          async () => {
            while (alive(current) && !current.stop && cursor < queue.length) {
              await execute(queue[cursor++])
            }
          },
        ),
      )
    } catch (error) {
      if (alive(current))
        setQueryError(
          error instanceof Error ? error.message : '获取全库候选失败',
        )
    } finally {
      try {
        if (alive(current) && dispatched > 0) {
          // 等所有已发出请求结束后统一补拉，并只通知一次分类数量更新。
          await load(pageRef.current)
          if (alive(current)) onConvertedRef.current()
        }
      } finally {
        current.busy = false
        if (alive(current)) {
          setBatchCandidates(null)
          setRunning(false)
          setStopping(false)
          setActiveIds([])
        }
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
    availableAtOpen,
    items:
      batchCandidates?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ??
      data?.items ??
      [],
    loading,
    queryError,
    failures,
    progress,
    running,
    stopping,
    activeIds,
    run,
    stop,
    reload: () => load(page),
  }
}
