import type {
  OrganizeResultDetail,
  OrganizeResultListItem,
} from '@/shared/eagle/organize'
import { Button, Empty, Spin, Tag, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { eagleFileUrl, eagleThumbnailUrl } from '../api'
import {
  confirmOrganizeResult,
  fetchOrganizeResult,
  fetchOrganizeResults,
  retryOrganizeResult,
  skipOrganizeResult,
} from './api'
import { refreshOrganizeStatus, useOrganizeStatus } from './store'

// 步骤 3 结果确认：顶部待确认缩略图条（点击选中）+ 左大图右信息面板 +
// 底部操作（不处理 / 重新执行 / 确认（不含标题）/ 确认）；
// 确认与不处理后自动选中下一张，重新执行会把任务拉回执行中（弹窗切步骤 2）
export function StepConfirm() {
  const { status } = useOrganizeStatus()
  const [results, setResults] = useState<OrganizeResultListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrganizeResultDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // 待确认 = success + failed：按状态分别拉取（避免把已确认/跳过的结果也拉回来），
  // 按完成时间正序展示（接口列表为倒序）
  const refreshResults = useCallback(async (): Promise<
    OrganizeResultListItem[]
  > => {
    const [succeeded, failed] = await Promise.all([
      fetchOrganizeResults('success'),
      fetchOrganizeResults('failed'),
    ])
    const pending = [...succeeded, ...failed].sort(
      (a, b) => a.updatedAt - b.updatedAt,
    )
    setResults(pending)
    return pending
  }, [])

  // 挂载与每次 SSE 变更（status 引用变化）后重拉列表，选中项失效时回退到第一张
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refreshResults()
      .then((pending) => {
        if (cancelled) return
        setSelectedId((prev) =>
          prev && pending.some((r) => r.itemId === prev)
            ? prev
            : (pending[0]?.itemId ?? null),
        )
      })
      .catch((error) => {
        console.error('拉取待确认结果失败', error)
        message.error('拉取待确认结果失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshResults, status])

  // 选中项变化时拉取详情
  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    fetchOrganizeResult(selectedId)
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .catch((error) => {
        console.error('拉取结果详情失败', error)
        if (!cancelled) setDetail(null)
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const runAction = async (fn: (itemId: string) => Promise<void>) => {
    if (!selectedId || actionLoading) return
    // 操作后自动选中下一张（最后一张则回退到剩余第一张）
    const index = results.findIndex((r) => r.itemId === selectedId)
    const nextId = results[index + 1]?.itemId ?? null
    setActionLoading(true)
    try {
      await fn(selectedId)
      setSelectedId(nextId)
      // SSE 也会触发重拉，这里主动刷一次让界面立即切换
      await refreshOrganizeStatus()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading && results.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center">
        <Spin />
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center">
        <Empty description="没有待确认的结果" />
      </div>
    )
  }

  const canConfirm = detail?.status === 'success'

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-slate-500 dark:text-slate-400">
        剩余 {results.length} 张待确认（判定成功与失败均需逐张处理）
      </div>

      {/* 顶部待确认缩略图条 */}
      <div className="flex gap-2 overflow-x-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
        {results.map((result) => (
          <button
            key={result.itemId}
            type="button"
            onClick={() => setSelectedId(result.itemId)}
            className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
              result.itemId === selectedId
                ? 'border-blue-500'
                : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <img
              src={eagleThumbnailUrl(result.itemId)}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            {result.status === 'failed' && (
              <span className="absolute right-0 bottom-0 bg-red-500 px-1 text-[10px] leading-4 text-white">
                失败
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 中部：左大图 + 右信息面板 */}
      <div className="grid grid-cols-[minmax(0,1fr)_248px] gap-3">
        <div className="flex h-80 items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800/60">
          {selectedId && (
            <img
              key={selectedId}
              src={eagleFileUrl(selectedId)}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>
        <div className="flex h-80 flex-col gap-3 overflow-y-auto rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
          {detailLoading || !detail ? (
            <div className="flex flex-1 items-center justify-center">
              <Spin />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 dark:text-slate-400">
                  执行状态
                </span>
                {detail.status === 'success' ? (
                  <Tag color="green">判定成功</Tag>
                ) : (
                  <Tag color="red">判定失败</Tag>
                )}
              </div>
              <div>
                <div className="mb-1 text-xs text-slate-400">当前标题</div>
                <div className="break-all">
                  {detail.itemName ?? '（条目已不在库中）'}
                </div>
              </div>
              {detail.status === 'success' ? (
                <>
                  <div>
                    <div className="mb-1 text-xs text-slate-400">建议标题</div>
                    <div className="break-all">{detail.title}</div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-slate-400">
                      调整到文件夹
                    </div>
                    <div className="break-all">{detail.folderPath}</div>
                  </div>
                  {detail.lowQuality && (
                    <div className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                      疑似低质图片（分辨率低、画面主体不清晰、美学品味较差等）
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <div className="mb-1 text-xs text-slate-400">失败原因</div>
                  <div className="break-all text-red-500">{detail.error}</div>
                  <div className="mt-2 text-xs text-slate-400">
                    判定失败的结果没有目标文件夹，可重新执行或不处理
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 底部操作：不处理（红）/ 重新执行 / 确认（不含标题）/ 确认 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        <Button
          danger
          loading={actionLoading}
          disabled={!selectedId}
          onClick={() => runAction(skipOrganizeResult)}
        >
          不处理
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            loading={actionLoading}
            disabled={!selectedId}
            onClick={() => runAction(retryOrganizeResult)}
          >
            重新执行
          </Button>
          <Button
            loading={actionLoading}
            disabled={!selectedId || !canConfirm}
            onClick={() => runAction((id) => confirmOrganizeResult(id, false))}
          >
            确认（不含标题）
          </Button>
          <Button
            type="primary"
            loading={actionLoading}
            disabled={!selectedId || !canConfirm}
            onClick={() => runAction((id) => confirmOrganizeResult(id, true))}
          >
            确认
          </Button>
        </div>
      </div>
    </div>
  )
}
