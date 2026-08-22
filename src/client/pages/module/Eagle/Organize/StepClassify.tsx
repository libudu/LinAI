import type { OrganizePrepareResp } from '@/shared/eagle/organize'
import {
  ORGANIZE_VISION_USER_TEXT,
  buildOrganizeVisionSystemPrompt,
} from '@/shared/eagle/organize'
import { Button, Checkbox, Empty, InputNumber, Modal, Spin, message } from 'antd'
import { useEffect, useState } from 'react'
import { useEagleStore } from '../store'
import { createOrganizeTask, fetchOrganizePrepare } from './api'
import { refreshOrganizeStatus } from './store'

// 步骤 1 分类文件夹划定：有描述的文件夹即分类标准（顺序即优先级），
// 设置处理数量与压缩选项，确定后创建任务进入队列
export function StepClassify({ onClose }: { onClose: () => void }) {
  const { currentFolderId, sortBy, sortOrder } = useEagleStore()
  const [prepare, setPrepare] = useState<OrganizePrepareResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [count, setCount] = useState<number | null>(null)
  const [compress, setCompress] = useState(true)
  const [creating, setCreating] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)

  useEffect(() => {
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
        setCount(data.imageCount)
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
  }, [currentFolderId, sortBy, sortOrder])

  const standards = prepare?.standards ?? []
  const imageCount = prepare?.imageCount ?? 0

  const handleCreate = async () => {
    if (!count) return
    setCreating(true)
    try {
      await createOrganizeTask({
        folderId: currentFolderId || undefined,
        sortBy,
        sortOrder,
        count,
        compress,
      })
      message.success('任务已创建，开始处理队列')
      // SSE 也会触发刷新，这里主动拉一次让步骤立即切换
      await refreshOrganizeStatus()
    } catch (error) {
      console.error('创建图片整理任务失败', error)
      message.error(error instanceof Error ? error.message : '创建任务失败')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-56 items-center justify-center">
        <Spin />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-slate-500 dark:text-slate-400">
        将以下有描述的文件夹作为分类标准（从上到下优先级递减），对当前范围内的图片执行
        AI 分类；gif 动图与视频不会处理。
      </div>

      {standards.length === 0 ? (
        <Empty
          className="py-8"
          description="没有包含描述的文件夹，请先在文件夹右键「编辑」中填写描述作为分类标准"
        />
      ) : (
        <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-700/60 dark:border-slate-700">
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

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">处理数量</span>
          <InputNumber
            min={1}
            max={Math.max(imageCount, 1)}
            value={count}
            disabled={imageCount === 0}
            onChange={(value) => setCount(value && value > 0 ? value : 1)}
          />
          <span className="text-xs text-slate-400">
            / 共 {imageCount} 张可处理图片
          </span>
        </div>
        <Checkbox
          checked={compress}
          onChange={(e) => setCompress(e.target.checked)}
        >
          上传前压缩图片（不改动本地文件）
        </Checkbox>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-700">
        <Button
          disabled={standards.length === 0}
          onClick={() => setPromptOpen(true)}
        >
          预览提示词
        </Button>
        <div className="flex gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            loading={creating}
            disabled={standards.length === 0 || imageCount === 0 || !count}
            onClick={handleCreate}
          >
            确定
          </Button>
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
