import type { OrganizePrepareResp } from '@/shared/eagle/organize'
import {
  ORGANIZE_CONCURRENCY_DEFAULT,
  ORGANIZE_CONCURRENCY_MAX,
  ORGANIZE_CONCURRENCY_MIN,
  ORGANIZE_VISION_USER_TEXT,
  buildOrganizeVisionSystemPrompt,
} from '@/shared/eagle/organize'
import {
  Button,
  Checkbox,
  Empty,
  InputNumber,
  Modal,
  Spin,
  message,
} from 'antd'
import { useEffect, useState } from 'react'
import { useEagleStore } from '../store'
import {
  appendOrganizeTask,
  createOrganizeTask,
  fetchOrganizePrepare,
} from './api'
import { refreshOrganizeStatus } from './store'

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

// 步骤 1 分类文件夹划定 / 追加图片：
// - 未锁定时：新建任务模式，配置数量、并发与压缩；
// - 锁定状态下：追加模式，将当前锁定文件夹中未加入队列的图片追加到队尾
export function StepClassify({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess?: () => void
}) {
  const { currentFolderId, sortBy, sortOrder } = useEagleStore()
  const [initialOptions] = useState(loadOrganizeOptions)
  const [prepare, setPrepare] = useState<OrganizePrepareResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [count, setCount] = useState<number | null>(null)
  const [compress, setCompress] = useState(initialOptions.compress)
  const [concurrency, setConcurrency] = useState(initialOptions.concurrency)
  const [submitting, setSubmitting] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)

  const isLocked = !!prepare?.lockedFolderName
  const availableCount = prepare?.availableCount ?? 0
  const imageCount = prepare?.imageCount ?? 0
  const standards = prepare?.standards ?? []

  const loadPrepareData = () => {
    let cancelled = false
    setLoading(true)
    fetchOrganizePrepare({
      folderId: currentFolderId || undefined,
      sortBy,
      sortOrder,
    })
      .then((data) => {
        if (cancelled) return
        setPrepare(data)
        const isCurrentlyLocked = !!data.lockedFolderName
        const maxAvailable = isCurrentlyLocked
          ? data.availableCount
          : data.imageCount
        setCount(
          maxAvailable > 0
            ? Math.min(loadOrganizeOptions().count, maxAvailable)
            : null,
        )
      })
      .catch((error) => {
        console.error('获取图片整理准备数据失败', error)
        message.error('获取分类标准失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }

  useEffect(() => {
    return loadPrepareData()
  }, [currentFolderId, sortBy, sortOrder])

  const saveOptions = (next: Partial<OrganizeOptions>) => {
    persistOrganizeOptions({
      count: count ?? ORGANIZE_COUNT_DEFAULT,
      compress,
      concurrency,
      ...next,
    })
  }

  const handleCreate = async () => {
    if (!count) return
    setSubmitting(true)
    try {
      await createOrganizeTask({
        folderId: currentFolderId || undefined,
        sortBy,
        sortOrder,
        count,
        compress,
        concurrency,
      })
      message.success('任务已创建，开始处理队列')
      await refreshOrganizeStatus()
      onSuccess?.()
    } catch (error) {
      console.error('创建图片整理任务失败', error)
      message.error(error instanceof Error ? error.message : '创建任务失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAppend = async () => {
    if (!count) return
    setSubmitting(true)
    try {
      await appendOrganizeTask({ count })
      message.success(`已成功追加 ${count} 张图片到队列`)
      await refreshOrganizeStatus()
      loadPrepareData()
      onSuccess?.()
    } catch (error) {
      console.error('追加图片失败', error)
      message.error(error instanceof Error ? error.message : '追加图片失败')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spin />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        {standards.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <Empty description="没有包含描述的文件夹，请先在文件夹右键「编辑」中填写描述作为分类标准" />
          </div>
        ) : (
          <div className="flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700/60">
            {standards.map((standard, index) => (
              <div
                key={standard.folderId}
                className="flex items-center gap-3 px-3 py-2"
                title={`${standard.folderPath}：${standard.description}`}
              >
                <span className="w-6 shrink-0 text-right text-xs text-slate-400">
                  {index + 1}
                </span>
                <span
                  className="w-44 shrink-0 truncate text-sm font-medium"
                  title={standard.folderPath}
                >
                  {standard.name}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-500 dark:text-slate-400">
                  {standard.description}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isLocked ? (
        <div className="flex flex-col gap-3">
          {availableCount === 0 ? (
            <Empty
              className="py-2"
              description="当前锁定文件夹下的所有图片已全部加入整理队列"
            />
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm">追加数量</span>
              <InputNumber
                min={1}
                max={Math.max(availableCount, 1)}
                value={count}
                onChange={(value) => {
                  const nextCount = Math.min(
                    availableCount,
                    value && value > 0 ? value : 1,
                  )
                  setCount(nextCount)
                }}
              />
              <span className="text-xs text-slate-400">
                / 剩余 {availableCount} 张未入队可处理图片
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">处理数量</span>
            <InputNumber
              min={1}
              max={Math.max(imageCount, 1)}
              value={count}
              disabled={imageCount === 0}
              onChange={(value) => {
                const nextCount = Math.min(
                  imageCount,
                  value && value > 0 ? value : 1,
                )
                setCount(nextCount)
                saveOptions({ count: nextCount })
              }}
            />
            <span className="text-xs text-slate-400">
              / 共 {imageCount} 张可处理图片
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">并发数</span>
            <InputNumber
              min={ORGANIZE_CONCURRENCY_MIN}
              max={ORGANIZE_CONCURRENCY_MAX}
              value={concurrency}
              onChange={(value) => {
                const nextConcurrency = Math.min(
                  ORGANIZE_CONCURRENCY_MAX,
                  Math.max(
                    ORGANIZE_CONCURRENCY_MIN,
                    value && value >= 1 ? value : ORGANIZE_CONCURRENCY_DEFAULT,
                  ),
                )
                setConcurrency(nextConcurrency)
                saveOptions({ concurrency: nextConcurrency })
              }}
            />
            <span className="text-xs text-slate-400">
              同时处理数（{ORGANIZE_CONCURRENCY_MIN}~{ORGANIZE_CONCURRENCY_MAX}
              ）
            </span>
          </div>
          <Checkbox
            checked={compress}
            onChange={(e) => {
              const nextCompress = e.target.checked
              setCompress(nextCompress)
              saveOptions({ compress: nextCompress })
            }}
          >
            输入图片压缩节省 token
          </Checkbox>
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-700">
        <Button
          disabled={standards.length === 0}
          onClick={() => setPromptOpen(true)}
        >
          预览提示词
        </Button>
        <div className="flex gap-2">
          <Button onClick={onClose}>取消</Button>
          {isLocked ? (
            <Button
              type="primary"
              loading={submitting}
              disabled={availableCount === 0 || !count}
              onClick={handleAppend}
            >
              追加到队列
            </Button>
          ) : (
            <Button
              type="primary"
              loading={submitting}
              disabled={standards.length === 0 || imageCount === 0 || !count}
              onClick={handleCreate}
            >
              确定
            </Button>
          )}
        </div>
      </div>

      <Modal
        open={promptOpen}
        title="将要发送的提示词"
        width={640}
        footer={null}
        onCancel={() => setPromptOpen(false)}
      >
        <div className="flex flex-col gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            每张图片都会按下面的内容调用视觉模型：system 提示词相同，user
            消息的文本部分固定、图片紧随其后上传。
          </div>
          <div>
            <div className="mb-1 text-xs font-medium">System</div>
            <pre className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre-wrap dark:border-slate-700 dark:bg-slate-800/60">
              {buildOrganizeVisionSystemPrompt(standards)}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium">User（文本部分）</div>
            <pre className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre-wrap dark:border-slate-700 dark:bg-slate-800/60">
              {ORGANIZE_VISION_USER_TEXT}
            </pre>
          </div>
        </div>
      </Modal>
    </div>
  )
}
