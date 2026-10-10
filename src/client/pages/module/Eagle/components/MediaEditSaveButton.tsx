import { ApiError } from '@/client/service/http'
import type { EagleItem } from '@/shared/eagle/types'
import { SaveOutlined } from '@ant-design/icons'
import { Button, message, Progress } from 'antd'
import { useEffect, useRef, useState } from 'react'
import {
  cancelEagleMediaEditSaveJob,
  fetchEagleMediaEditSaveJob,
  saveEagleItemMediaEdits,
  startEagleMediaEditSaveJob,
  type SaveEagleItemMediaEditsParams,
} from '../api'

type MediaEditSaveJob = Awaited<ReturnType<typeof fetchEagleMediaEditSaveJob>>
const phaseLabels = {
  queued: '等待处理',
  encoding: '正在转码',
  verifying: '正在校验视频',
  backup: '正在备份原文件',
  committing: '正在完成写入',
}

/** 保存显式的媒体编辑操作列表，预览组件负责把编辑状态转换为操作。 */
export function MediaEditSaveButton({
  id,
  contentVersion,
  operations,
  video = false,
  onSaved,
  onBusyChange,
}: {
  id: string
  contentVersion?: string
  operations: SaveEagleItemMediaEditsParams['operations']
  video?: boolean
  onSaved: (item: EagleItem) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const [saving, setSaving] = useState(false)
  const [job, setJob] = useState<MediaEditSaveJob | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [pollError, setPollError] = useState(false)
  const jobIdRef = useRef<string | null>(null)
  const savingRef = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const jobId = jobIdRef.current
      if (jobId)
        void cancelEagleMediaEditSaveJob(id, jobId).catch(() => undefined)
    }
  }, [id])
  const saveVideoEdits = async (request: SaveEagleItemMediaEditsParams) => {
    const { id: jobId } = await startEagleMediaEditSaveJob(id, request)
    jobIdRef.current = jobId
    if (!mounted.current) {
      await cancelEagleMediaEditSaveJob(id, jobId)
      return null
    }
    while (mounted.current) {
      let next: MediaEditSaveJob
      try {
        next = await fetchEagleMediaEditSaveJob(id, jobId)
      } catch (error) {
        // 暂时断网不代表保存失败，保持任务身份并重试，以免重复覆盖。
        if (error instanceof ApiError && error.status === 404) throw error
        if (mounted.current) setPollError(true)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        continue
      }
      if (mounted.current) {
        setPollError(false)
        setJob(next)
      }
      if (next.status === 'completed') return next.result
      if (next.status === 'failed') throw new Error(next.error)
      if (next.status === 'cancelled') {
        if (mounted.current) message.info('已取消，原文件未覆盖')
        return null
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    return null
  }
  if (!operations.length && !saving) return null
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {(!video || !saving) && (
        <Button
          icon={<SaveOutlined />}
          loading={saving}
          disabled={!contentVersion || !operations.length}
          title="保存当前媒体编辑并覆盖，原文件移入 Eagle 回收站"
          onClick={async (event) => {
            event.stopPropagation()
            if (savingRef.current || !contentVersion || !operations.length)
              return
            savingRef.current = true
            setSaving(true)
            setJob(null)
            setCancelling(false)
            setPollError(false)
            onBusyChange?.(true)
            const hide = video ? () => {} : message.loading('正在保存图片…', 0)
            try {
              const request: SaveEagleItemMediaEditsParams = {
                contentVersion,
                operations: operations.map((operation) => ({ ...operation })),
              }
              const result = video
                ? await saveVideoEdits(request)
                : await saveEagleItemMediaEdits(id, request)
              if (!result) return
              if (result.warning) message.warning(result.warning, 8)
              else message.success('已覆盖原文件，原始文件已移入 Eagle 回收站')
              if (mounted.current) onSaved(result.item)
            } catch (error) {
              message.error(
                error instanceof Error ? error.message : '媒体编辑保存失败',
              )
            } finally {
              hide()
              jobIdRef.current = null
              savingRef.current = false
              if (mounted.current) {
                setSaving(false)
                onBusyChange?.(false)
              }
            }
          }}
        >
          {saving ? '正在保存…' : '覆盖原文件'}
        </Button>
      )}
      {video && saving && (
        <div
          className="min-w-52 rounded-lg bg-black/60 px-3 py-2 text-white"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3 text-xs">
            <span>
              {cancelling || job?.status === 'cancelling'
                ? '正在终止并清理…'
                : phaseLabels[job?.phase ?? 'queued']}
            </span>
            <span className="tabular-nums">{job?.percent ?? 0}%</span>
          </div>
          <Progress percent={job?.percent ?? 0} showInfo={false} size="small" />
          {pollError && (
            <div className="mb-2 text-xs">进度连接中断，正在重试…</div>
          )}
          <Button
            block
            size="small"
            loading={cancelling || job?.status === 'cancelling'}
            disabled={!jobIdRef.current || !job?.canCancel || cancelling}
            onClick={async (event) => {
              event.stopPropagation()
              const jobId = jobIdRef.current
              if (!jobId || cancelling) return
              setCancelling(true)
              try {
                const next = await cancelEagleMediaEditSaveJob(id, jobId)
                if (mounted.current) {
                  setJob(next)
                  if (next.status !== 'cancelling') setCancelling(false)
                }
              } catch (error) {
                if (mounted.current) setCancelling(false)
                message.error(
                  error instanceof Error ? error.message : '取消失败，请重试',
                )
              }
            }}
          >
            {job?.phase === 'committing' ? '正在完成写入' : '取消保存'}
          </Button>
        </div>
      )}
    </div>
  )
}
