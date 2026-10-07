import {
  ORGANIZE_CONCURRENCY_DEFAULT,
  ORGANIZE_CONCURRENCY_MAX,
  ORGANIZE_CONCURRENCY_MIN,
  type OrganizeClassificationMode,
  type OrganizePrepareResp,
} from '@/shared/eagle/organize'
import { message } from 'antd'
import { useEffect, useState } from 'react'
import { useEagleStore } from '../../store'
import {
  appendOrganizeTask,
  createOrganizeTask,
  fetchOrganizePrepare,
  syncOrganizeStandards,
} from '../api'
import { refreshOrganizeStatus, useOrganizeStatus } from '../store'

const ORGANIZE_OPTIONS_STORAGE_KEY = 'eagle_organize_options'
const ORGANIZE_COUNT_DEFAULT = 100

interface OrganizeOptions {
  count: number
  compress: boolean
  concurrency: number
}

const loadOrganizeOptions = (): OrganizeOptions => {
  const defaults: OrganizeOptions = {
    count: ORGANIZE_COUNT_DEFAULT,
    compress: true,
    concurrency: ORGANIZE_CONCURRENCY_DEFAULT,
  }

  try {
    const raw = localStorage.getItem(ORGANIZE_OPTIONS_STORAGE_KEY)
    if (!raw) return defaults

    const parsed = JSON.parse(raw) as Partial<OrganizeOptions>
    return {
      count:
        typeof parsed.count === 'number' &&
        Number.isInteger(parsed.count) &&
        parsed.count > 0
          ? parsed.count
          : defaults.count,
      compress:
        typeof parsed.compress === 'boolean'
          ? parsed.compress
          : defaults.compress,
      concurrency:
        typeof parsed.concurrency === 'number' &&
        Number.isInteger(parsed.concurrency)
          ? Math.min(
              ORGANIZE_CONCURRENCY_MAX,
              Math.max(ORGANIZE_CONCURRENCY_MIN, parsed.concurrency),
            )
          : defaults.concurrency,
    }
  } catch {
    return defaults
  }
}

const persistOrganizeOptions = (options: OrganizeOptions) => {
  try {
    localStorage.setItem(ORGANIZE_OPTIONS_STORAGE_KEY, JSON.stringify(options))
  } catch {
    // 忽略浏览器禁用存储或存储空间不足，不影响任务创建
  }
}

/** 准备范围、任务模式、选项持久化与提交；页面仅装配 UI。 */
export function useClassifyTask(
  onSuccess?: () => void,
  conversionRevision = 0,
) {
  const currentFolderId = useEagleStore((state) => state.currentFolderId)
  const sortBy = useEagleStore((state) => state.sortBy)
  const sortOrder = useEagleStore((state) => state.sortOrder)
  const { status } = useOrganizeStatus()
  const [initialOptions] = useState(loadOrganizeOptions)
  const [prepare, setPrepare] = useState<OrganizePrepareResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [count, setCount] = useState<number | null>(null)
  const [compress, setCompress] = useState(initialOptions.compress)
  const [concurrency, setConcurrency] = useState(initialOptions.concurrency)
  const [classificationMode, setClassificationMode] =
    useState<OrganizeClassificationMode>('global')
  const [submitting, setSubmitting] = useState(false)
  const [syncingStandards, setSyncingStandards] = useState(false)
  const [prepareRevision, setPrepareRevision] = useState(0)
  const reloadPrepare = () => setPrepareRevision((revision) => revision + 1)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setPrepare(null)
    fetchOrganizePrepare({
      folderId: currentFolderId || undefined,
      classificationMode,
      sortBy,
      sortOrder,
    })
      .then((data) => {
        if (cancelled) return
        setPrepare(data)
        setCount(
          data.availableCount > 0
            ? data.classificationMode === 'recursive-rename'
              ? data.availableCount
              : Math.min(loadOrganizeOptions().count, data.availableCount)
            : null,
        )
      })
      .catch((error) => {
        if (cancelled) return
        console.error('获取图片整理准备数据失败', error)
        message.error('获取分类标准失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    currentFolderId,
    classificationMode,
    sortBy,
    sortOrder,
    status?.phase,
    status?.taskId,
    status?.total,
    prepareRevision,
    conversionRevision,
  ])

  const hasActiveTask = prepare?.hasActiveTask ?? false
  const availableCount = prepare?.availableCount ?? 0
  const imageCount = prepare?.imageCount ?? 0
  const saveOptions = (next: Partial<OrganizeOptions>) => {
    persistOrganizeOptions({
      count: count ?? ORGANIZE_COUNT_DEFAULT,
      compress,
      concurrency,
      ...next,
    })
  }
  const handleCountChange = (value: number | null) => {
    const max = hasActiveTask ? availableCount : imageCount
    const next = Math.min(max, value && value > 0 ? value : 1)
    setCount(next)
    if (!hasActiveTask) saveOptions({ count: next })
  }
  const handleConcurrencyChange = (value: number | null) => {
    const next = Math.min(
      ORGANIZE_CONCURRENCY_MAX,
      Math.max(
        ORGANIZE_CONCURRENCY_MIN,
        value && value >= 1 ? value : ORGANIZE_CONCURRENCY_DEFAULT,
      ),
    )
    setConcurrency(next)
    saveOptions({ concurrency: next })
  }
  const handleCompressChange = (value: boolean) => {
    setCompress(value)
    saveOptions({ compress: value })
  }

  const handleClassificationModeChange = (
    value: OrganizeClassificationMode,
  ) => {
    if (hasActiveTask || submitting || value === classificationMode) return
    setPrepare(null)
    setLoading(true)
    setClassificationMode(value)
  }

  const handleSyncStandards = async () => {
    if (!prepare?.taskId) return
    setSyncingStandards(true)
    try {
      await syncOrganizeStandards(prepare.taskId)
      message.success('已同步最新文件夹分类标准')
      await refreshOrganizeStatus()
      reloadPrepare()
    } catch (error) {
      console.error('同步分类标准失败', error)
      message.error(error instanceof Error ? error.message : '同步分类标准失败')
    } finally {
      setSyncingStandards(false)
    }
  }

  const handleSubmit = async () => {
    if (
      !count ||
      !prepare ||
      loading ||
      submitting ||
      (!prepare.standards.length &&
        prepare.classificationMode !== 'recursive-rename')
    )
      return
    setSubmitting(true)
    const range = {
      folderId: currentFolderId || undefined,
      sortBy,
      sortOrder,
      count,
    }
    try {
      if (hasActiveTask && prepare.taskId) {
        await appendOrganizeTask({ ...range, taskId: prepare.taskId })
        message.success('已追加图片到队列，重复图片自动过滤')
      } else {
        await createOrganizeTask({
          ...range,
          classificationMode: prepare.classificationMode,
          compress,
          concurrency,
          expectedTaskId: prepare.taskId,
        })
        message.success('任务已创建，开始处理队列')
      }
      await refreshOrganizeStatus()
      reloadPrepare()
      onSuccess?.()
    } catch (error) {
      const label = hasActiveTask ? '追加图片失败' : '创建图片整理任务失败'
      console.error(label, error)
      message.error(error instanceof Error ? error.message : label)
    } finally {
      setSubmitting(false)
    }
  }

  return {
    prepare,
    loading,
    count,
    compress,
    concurrency,
    classificationMode: prepare?.classificationMode ?? classificationMode,
    submitting,
    syncingStandards,
    hasActiveTask,
    isRunning: status?.phase === 'running',
    availableCount,
    imageCount,
    standards: prepare?.standards ?? [],
    handleCountChange,
    handleConcurrencyChange,
    handleCompressChange,
    handleClassificationModeChange,
    handleSyncStandards,
    handleSubmit,
  }
}
