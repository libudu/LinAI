import {
  ORGANIZE_CONCURRENCY_MAX,
  ORGANIZE_CONCURRENCY_MIN,
  buildOrganizeVisionSystemPrompt,
  buildOrganizeVisionUserText,
  type OrganizeClassificationMode,
} from '@/shared/eagle/organize'
import {
  Button,
  Checkbox,
  Empty,
  InputNumber,
  Modal,
  Segmented,
  Spin,
  Tooltip,
} from 'antd'
import { useEffect, useState } from 'react'
import { QueueList } from './StepRunning/QueueList'
import { useClassifyTask } from './hooks/useClassifyTask'

// 步骤 1 分类文件夹划定 / 追加图片：
// - 无未完成任务时：新建任务模式，配置数量、并发与压缩；
// - 有未完成任务时：追加模式，可从普通文件夹添加，沿用任务设置与分类标准
export function StepClassify({
  onClose,
  onSuccess,
  conversionRevision,
  onClassificationModeChange,
}: {
  onClose: () => void
  onSuccess?: () => void
  conversionRevision?: number
  onClassificationModeChange?: (mode: OrganizeClassificationMode) => void
}) {
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptNeedsRename, setPromptNeedsRename] = useState(true)
  const {
    prepare,
    mediaType,
    loading,
    count,
    compress,
    concurrency,
    classificationMode,
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
    handleClassificationModeChange,
    handleSyncStandards,
    handleSubmit,
  } = useClassifyTask(onSuccess, conversionRevision)
  const mediaLabel = mediaType === 'video' ? '视频' : '图片'
  const unit = mediaType === 'video' ? '个' : '张'
  const renameOnly = classificationMode === 'recursive-rename'
  const missingStandards = !renameOnly && standards.length === 0
  useEffect(() => {
    onClassificationModeChange?.(classificationMode)
  }, [classificationMode, onClassificationModeChange])

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
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <span className="text-sm">分类模式</span>
        <Segmented<OrganizeClassificationMode>
          value={classificationMode}
          options={[
            { value: 'global', label: '全局分类' },
            { value: 'subfolders', label: '子目录分类' },
            { value: 'recursive-rename', label: '递归仅重命名' },
          ]}
          disabled={hasActiveTask || submitting}
          onChange={handleClassificationModeChange}
        />
        <span className="text-xs text-slate-400">
          {renameOnly
            ? `递归检查当前文件夹及所有子目录，直接重命名不符合当前模型命名规则的${mediaLabel}，无需手动确认，保留原目录归属`
            : classificationMode === 'global'
              ? '全库所有有描述的文件夹'
              : `${prepare?.classificationFolderName ?? '当前文件夹'}下所有层级的有描述子目录（不含当前文件夹）`}
          {hasActiveTask && '，追加时沿用当前任务的分类模式与标准'}
        </span>
      </div>
      {hasActiveTask ? (
        <div className="flex shrink-0 flex-col gap-3">
          {availableCount === 0 ? (
            <Empty
              className="py-2"
              description={`当前范围没有尚未入队的${mediaLabel}，可切换其他文件夹继续添加`}
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
          {mediaType === 'image' && (
            <Checkbox
              checked={compress}
              onChange={(e) => handleCompressChange(e.target.checked)}
            >
              输入图片压缩节省 token
            </Checkbox>
          )}
        </div>
      )}

      {mediaType === 'video' && (
        <div className="shrink-0 text-xs text-slate-500">
          本地按时长抽帧，保留视频比例；每帧长边最多 400/300px，32 帧以内按 4
          列排列，超过 32 帧按 8 列排列，最多 8 行。白边与间隔均为 4px，WebP
          质量 60。仅上传联系表图片。
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        {renameOnly ? (
          <div className="flex min-h-0 flex-1 flex-col p-2">
            <div className="shrink-0 border-b border-slate-100 px-1 pb-2 text-xs text-slate-400 dark:border-slate-700/60">
              待重命名{mediaLabel}：共 {availableCount} {unit}，预览前{' '}
              {prepare?.previewItems?.length ?? 0} {unit}（最多 50 {unit}）
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <QueueList
                items={(prepare?.previewItems ?? []).map((item) => ({
                  ...item,
                  state: 'pending',
                }))}
                showState={false}
                emptyDescription={
                  hasActiveTask
                    ? `当前文件夹及子目录内没有尚未入队的待重命名${mediaLabel}`
                    : `当前文件夹及子目录内没有需要重命名的可处理${mediaLabel}`
                }
              />
            </div>
          </div>
        ) : standards.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <Empty
              description={
                classificationMode === 'subfolders'
                  ? '当前文件夹下没有包含描述的子目录，请先在子目录右键「编辑」中填写描述作为分类标准'
                  : '没有包含描述的文件夹，请先在文件夹右键「编辑」中填写描述作为分类标准'
              }
            />
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

      <div className="flex shrink-0 items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Button
            disabled={missingStandards}
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
              disabled={missingStandards || availableCount === 0 || !count}
              onClick={handleSubmit}
            >
              追加到队列
            </Button>
          ) : (
            <Button
              type="primary"
              loading={submitting}
              disabled={missingStandards || imageCount === 0 || !count}
              onClick={handleSubmit}
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
            模型标识沿用「首个英文词 + 版本数字」规则（如 gemini3.7）。名称按 _
            分段后，最后一段的模型名称与当前接入点相同（忽略版本号与大小写）时
            {renameOnly ? '跳过处理' : '仅分类'}，模型名称不同则重新生成标题。
            例如 gemini3.7 与 gemini3.8 视为相同模型名称。{' '}
            {mediaType === 'video' ? '视频联系表图片' : '图片'}紧随 user
            文本上传。
          </div>
          {!renameOnly && (
            <Segmented<'rename' | 'classify'>
              value={promptNeedsRename ? 'rename' : 'classify'}
              options={[
                { value: 'rename', label: '分类并重命名' },
                { value: 'classify', label: '仅分类' },
              ]}
              onChange={(value) => setPromptNeedsRename(value === 'rename')}
            />
          )}
          <div>
            <div className="mb-1 text-xs font-medium">System</div>
            <pre className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre-wrap dark:border-slate-700 dark:bg-slate-800/60">
              {buildOrganizeVisionSystemPrompt(
                standards,
                renameOnly || promptNeedsRename,
                classificationMode,
                mediaType,
              )}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium">User（文本部分）</div>
            <pre className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre-wrap dark:border-slate-700 dark:bg-slate-800/60">
              {buildOrganizeVisionUserText(
                renameOnly || promptNeedsRename,
                classificationMode,
                mediaType,
              )}
            </pre>
          </div>
        </div>
      </Modal>
    </div>
  )
}
