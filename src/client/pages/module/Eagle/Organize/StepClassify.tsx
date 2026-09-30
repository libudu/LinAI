import {
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
  Tooltip,
} from 'antd'
import { useState } from 'react'
import { FolderSelectModal } from '../components/FolderSelectModal'
import { useClassifyTask } from './hooks/useClassifyTask'

// 步骤 1 分类文件夹划定 / 追加图片：
// - 无未完成任务时：新建任务模式，配置数量、并发与压缩；
// - 有未完成任务时：追加模式，可从任意文件夹添加，沿用任务设置与分类标准
export function StepClassify({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess?: () => void
}) {
  const [promptOpen, setPromptOpen] = useState(false)
  const [folderSelectOpen, setFolderSelectOpen] = useState(false)
  const {
    currentFolderId,
    prepare,
    loading,
    count,
    compress,
    concurrency,
    submitting,
    syncingStandards,
    hasActiveTask,
    isRunning,
    availableCount,
    imageCount,
    standards,
    handleCountChange,
    handleConcurrencyChange,
    handleCompressChange,
    handleSyncStandards,
    handleSubmit,
    handleFolderSelect,
  } = useClassifyTask(onSuccess)

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spin />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 items-center gap-3">
        <span className="min-w-0 truncate text-sm">
          添加范围：{prepare?.sourceFolderName ?? '当前选中文件夹'}
        </span>
        <Button onClick={() => setFolderSelectOpen(true)}>切换文件夹</Button>
        {hasActiveTask && (
          <span className="text-xs text-slate-400">
            当前范围已入队 {prepare?.enqueuedCount ?? 0} 张，跨文件夹自动去重
          </span>
        )}
      </div>
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

      {hasActiveTask ? (
        <div className="flex shrink-0 flex-col gap-3">
          {availableCount === 0 ? (
            <Empty
              className="py-2"
              description="当前范围没有尚未入队的图片，可切换其他文件夹继续添加"
            />
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm">追加数量</span>
              <InputNumber
                min={1}
                max={Math.max(availableCount, 1)}
                value={count}
                onChange={handleCountChange}
              />
              <span className="text-xs text-slate-400">/ {availableCount}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">处理数量</span>
            <InputNumber
              min={1}
              max={Math.max(imageCount, 1)}
              value={count}
              disabled={imageCount === 0}
              onChange={handleCountChange}
            />
            <span className="text-xs text-slate-400">/ {imageCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">并发数</span>
            <InputNumber
              min={ORGANIZE_CONCURRENCY_MIN}
              max={ORGANIZE_CONCURRENCY_MAX}
              value={concurrency}
              onChange={handleConcurrencyChange}
            />
            <span className="text-xs text-slate-400">
              同时处理数（{ORGANIZE_CONCURRENCY_MIN}~{ORGANIZE_CONCURRENCY_MAX}
              ）
            </span>
          </div>
          <Checkbox
            checked={compress}
            onChange={(e) => handleCompressChange(e.target.checked)}
          >
            输入图片压缩节省 token
          </Checkbox>
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Button
            disabled={standards.length === 0}
            onClick={() => setPromptOpen(true)}
          >
            预览提示词
          </Button>
          {hasActiveTask && !isRunning && prepare?.hasStandardsMismatch && (
            <Tooltip title="检测到外部文件夹顺序或分类标准已更新，点击将最新标准同步到当前任务">
              <Button loading={syncingStandards} onClick={handleSyncStandards}>
                同步最新文件夹
              </Button>
            </Tooltip>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={onClose}>取消</Button>
          {hasActiveTask ? (
            <Button
              type="primary"
              loading={submitting}
              disabled={availableCount === 0 || !count}
              onClick={handleSubmit}
            >
              追加到队列
            </Button>
          ) : (
            <Button
              type="primary"
              loading={submitting}
              disabled={standards.length === 0 || imageCount === 0 || !count}
              onClick={handleSubmit}
            >
              确定
            </Button>
          )}
        </div>
      </div>

      <FolderSelectModal
        open={folderSelectOpen}
        onClose={() => setFolderSelectOpen(false)}
        initialFolderId={currentFolderId || undefined}
        includeAll
        title="选择添加图片的文件夹"
        onConfirm={(folder) => handleFolderSelect(folder.id)}
      />
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
