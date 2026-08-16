import { useDebounceFn } from 'ahooks'
import {
  Button,
  Checkbox,
  Drawer,
  Input,
  InputNumber,
  Progress,
  Segmented,
  message,
} from 'antd'
import { useEffect, useState } from 'react'
import { useAppTheme } from '../../../../theme'
import { useNovelConfig } from '../SettingModal/useNovelConfig'
import { DEFAULT_TARGET_LENGTH } from '../service/constants'
import { buildMessages, getDefaultSelection } from '../service/context'
import { CONTEXT_WARN_RATIO, getContextWindow } from '../shared/tokenEstimate'
import type { DrawerRequest } from '../store'
import { useNovelStore } from '../store'
import type { Novel } from '../types'
import {
  artifactsByType,
  chapterIndex,
  findChapterArtifact,
  formatTokens,
  sortedChapters,
} from '../types'

type ChapterMode = 'full' | 'summary' | 'none'

// 章节当前的携带方式由勾选的文段 id 反推：勾了 content 文段 = 全文，勾了 summary 文段 = 摘要
const chapterModeOf = (
  novel: Novel,
  chapterId: string,
  artifactIds: string[],
): ChapterMode => {
  const content = findChapterArtifact(novel, chapterId, 'content')
  if (content && artifactIds.includes(content.id)) return 'full'
  const summary = findChapterArtifact(novel, chapterId, 'summary')
  if (summary && artifactIds.includes(summary.id)) return 'summary'
  return 'none'
}

// 切换某章的携带方式（全文/摘要互斥，先移除该章两条文段再按需加入）
const withChapterMode = (
  novel: Novel,
  chapterId: string,
  artifactIds: string[],
  mode: ChapterMode,
): string[] => {
  const content = findChapterArtifact(novel, chapterId, 'content')
  const summary = findChapterArtifact(novel, chapterId, 'summary')
  const own = [content?.id, summary?.id].filter(Boolean) as string[]
  const rest = artifactIds.filter((id) => !own.includes(id))
  if (mode === 'full' && content) return [...rest, content.id]
  if (mode === 'summary' && summary) return [...rest, summary.id]
  return rest
}

const DRAWER_TITLES: Record<DrawerRequest['outputType'], string> = {
  setting: '生成核心设定',
  outline: '生成章节大纲',
  content: '生成章节正文',
}

const INSTRUCTION_PLACEHOLDERS: Record<DrawerRequest['outputType'], string> = {
  setting: '设定要求（必填），如：参考材料整理一套世界观与主要角色',
  outline: '本章要求（可选），如：本章让两人关系出现裂痕',
  content: '写作要求（可选），如：对话多一些、节奏放慢',
}

// 抽屉内容（以 key 强制每次打开重新挂载，从而重置勾选状态）
const DrawerBody = ({ req, novel }: { req: DrawerRequest; novel: Novel }) => {
  const startGeneration = useNovelStore((s) => s.startGeneration)
  const closeDrawer = useNovelStore((s) => s.closeDrawer)
  const streaming = useNovelStore((s) => s.streaming)
  // 进度条颜色跟随全局强调色
  const { accentColor } = useAppTheme()

  const chapter = req.chapterId
    ? novel.chapters.find((c) => c.id === req.chapterId)
    : undefined

  // 默认勾选：按产出类型走 service/context 的默认规则
  const [artifactIds, setArtifactIds] = useState<string[]>(
    () =>
      getDefaultSelection(novel, 'generate', {
        outputType: req.outputType,
        chapter,
      }).artifactIds,
  )
  const [instruction, setInstruction] = useState('')
  const [targetLength, setTargetLength] = useState<number | null>(
    DEFAULT_TARGET_LENGTH,
  )
  const [estimate, setEstimate] = useState<{
    estimatedTokens: number
    contextWindow: number
  } | null>(null)

  // 实时 token 估算（防抖 300ms），本地组装上下文估算，失败静默
  const novelModelId = useNovelConfig((s) => s.novelModelId)
  const { run: runEstimate } = useDebounceFn(
    (ids: string[], instr: string) => {
      try {
        const { estimatedTokens } = buildMessages({
          novel,
          op: 'generate',
          outputType: req.outputType,
          chapter,
          selection: { artifactIds: ids },
          instruction: instr || undefined,
        })
        setEstimate({
          estimatedTokens,
          contextWindow: getContextWindow(novelModelId),
        })
      } catch {
        // 忽略估算错误
      }
    },
    { wait: 300 },
  )
  useEffect(() => {
    runEstimate(artifactIds, instruction)
  }, [artifactIds, instruction, runEstimate])

  const toggleArtifact = (id: string, checked: boolean) =>
    setArtifactIds((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id),
    )

  const refs = artifactsByType(novel, 'ref')
  const settings = artifactsByType(novel, 'setting')
  const refIds = refs.map((r) => r.id)
  const settingIds = settings.map((s) => s.id)
  const checkedRefCount = refIds.filter((id) => artifactIds.includes(id)).length
  const checkedSettingCount = settingIds.filter((id) =>
    artifactIds.includes(id),
  ).length

  const percent = estimate
    ? (estimate.estimatedTokens / estimate.contextWindow) * 100
    : 0
  const over = percent > 100
  const warn = !over && percent > CONTEXT_WARN_RATIO * 100

  const handleSubmit = async () => {
    const instr = instruction.trim()
    if (req.outputType === 'setting' && !instr) {
      message.warning('请填写设定要求')
      return
    }
    closeDrawer()
    const selection = { artifactIds }
    if (req.outputType === 'setting') {
      await startGeneration({
        op: 'generate',
        outputType: 'setting',
        novelId: novel.id,
        instruction: instr,
        selection,
      })
    } else if (req.outputType === 'outline') {
      await startGeneration({
        op: 'generate',
        outputType: 'outline',
        novelId: novel.id,
        chapterId: req.chapterId,
        instruction: instr || undefined,
        selection,
      })
    } else {
      await startGeneration({
        op: 'generate',
        outputType: 'content',
        novelId: novel.id,
        chapterId: req.chapterId!,
        instruction: instr || undefined,
        selection,
        targetLength: targetLength ?? undefined,
      })
    }
  }

  const historyChapters = sortedChapters(novel).filter(
    (c) => c.id !== req.chapterId,
  )

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
        {/* 参考文（生成设定时默认全勾，其余默认不勾） */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">参考文</span>
            {refs.length > 0 && (
              <Button
                type="link"
                size="small"
                onClick={() =>
                  setArtifactIds((prev) =>
                    checkedRefCount === refIds.length
                      ? prev.filter((id) => !refIds.includes(id))
                      : [
                          ...prev.filter((id) => !refIds.includes(id)),
                          ...refIds,
                        ],
                  )
                }
              >
                {checkedRefCount === refIds.length ? '清空' : '全选'}
              </Button>
            )}
          </div>
          {refs.length === 0 ? (
            <div className="text-xs text-slate-400">无参考文</div>
          ) : (
            <div className="space-y-1">
              {refs.map((ref) => (
                <div key={ref.id}>
                  <Checkbox
                    checked={artifactIds.includes(ref.id)}
                    onChange={(e) => toggleArtifact(ref.id, e.target.checked)}
                  >
                    <span className="text-sm">{ref.title}</span>
                    <span className="ml-1 text-xs text-slate-400">
                      {ref.content.length.toLocaleString()} 字
                    </span>
                  </Checkbox>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 核心设定（默认全勾） */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">核心设定</span>
            {settings.length > 0 && (
              <Button
                type="link"
                size="small"
                onClick={() =>
                  setArtifactIds((prev) =>
                    checkedSettingCount === settingIds.length
                      ? prev.filter((id) => !settingIds.includes(id))
                      : [
                          ...prev.filter((id) => !settingIds.includes(id)),
                          ...settingIds,
                        ],
                  )
                }
              >
                {checkedSettingCount === settingIds.length ? '清空' : '全选'}
              </Button>
            )}
          </div>
          {settings.length === 0 ? (
            <div className="text-xs text-slate-400">无核心设定</div>
          ) : (
            <div className="space-y-1">
              {settings.map((setting) => (
                <div key={setting.id}>
                  <Checkbox
                    checked={artifactIds.includes(setting.id)}
                    onChange={(e) =>
                      toggleArtifact(setting.id, e.target.checked)
                    }
                  >
                    <span className="text-sm">{setting.title}</span>
                  </Checkbox>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 历史章节（每章：全文 / 仅摘要 / 不带） */}
        <div>
          <div className="mb-1 text-sm font-medium text-slate-600">
            历史章节
            <span className="ml-1 text-xs font-normal text-slate-400">
              （默认最近 {novel.recentFullChapters} 章全文，其余摘要）
            </span>
          </div>
          {historyChapters.length === 0 ? (
            <div className="text-xs text-slate-400">无历史章节</div>
          ) : (
            <div className="space-y-1.5">
              {historyChapters.map((ch) => {
                const hasContent = !!findChapterArtifact(
                  novel,
                  ch.id,
                  'content',
                )
                const hasSummary = !!findChapterArtifact(
                  novel,
                  ch.id,
                  'summary',
                )
                return (
                  <div
                    key={ch.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      第 {chapterIndex(novel, ch.id)} 章
                      {ch.title && (
                        <span className="ml-1 text-xs text-slate-400">
                          {ch.title}
                        </span>
                      )}
                    </span>
                    <Segmented
                      size="small"
                      value={chapterModeOf(novel, ch.id, artifactIds)}
                      onChange={(v) =>
                        setArtifactIds((prev) =>
                          withChapterMode(novel, ch.id, prev, v as ChapterMode),
                        )
                      }
                      options={[
                        { label: '全文', value: 'full', disabled: !hasContent },
                        {
                          label: '摘要',
                          value: 'summary',
                          disabled: !hasSummary,
                        },
                        { label: '不带', value: 'none' },
                      ]}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 指令 */}
        <div>
          <div className="mb-1 text-sm font-medium text-slate-600">
            {req.outputType === 'setting' ? '设定要求' : '附加要求'}
          </div>
          <Input.TextArea
            rows={3}
            placeholder={INSTRUCTION_PLACEHOLDERS[req.outputType]}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
        </div>

        {req.outputType === 'content' && (
          <div>
            <div className="mb-1 text-sm font-medium text-slate-600">
              目标篇幅（字）
            </div>
            <InputNumber
              className="w-full"
              min={500}
              max={20000}
              step={500}
              value={targetLength}
              onChange={(v) => setTargetLength(v)}
            />
          </div>
        )}
      </div>

      {/* 底部固定栏：估算 + 占用比例 + 超量警告 + 提交 */}
      <div className="shrink-0 border-t border-slate-200 pt-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-slate-500">预计上下文占用</span>
          <span
            className={
              over ? 'text-red-500' : warn ? 'text-amber-500' : 'text-slate-500'
            }
          >
            {estimate
              ? `≈${formatTokens(estimate.estimatedTokens)} / ${formatTokens(estimate.contextWindow)} tokens（${percent.toFixed(0)}%）`
              : '估算中…'}
          </span>
        </div>
        <Progress
          percent={Math.min(100, percent)}
          showInfo={false}
          size="small"
          strokeColor={over ? '#ff4d4f' : warn ? '#faad14' : accentColor}
        />
        {over && (
          <div className="mt-1 text-xs text-red-500">
            已超出模型上下文窗口，请减少全文章节数或取消部分勾选
          </div>
        )}
        {warn && (
          <div className="mt-1 text-xs text-amber-500">
            上下文占用超过 80%，可能影响生成质量
          </div>
        )}
        <Button
          type="primary"
          block
          className="mt-3"
          disabled={!estimate || over || !!streaming}
          onClick={handleSubmit}
        >
          开始生成
        </Button>
      </div>
    </div>
  )
}

// 上下文选择抽屉：点生成时从右侧弹出
export const ContextDrawer = () => {
  const drawer = useNovelStore((s) => s.drawer)
  const closeDrawer = useNovelStore((s) => s.closeDrawer)
  const currentNovel = useNovelStore((s) => s.currentNovel)

  return (
    <Drawer
      title={drawer ? DRAWER_TITLES[drawer.outputType] : ''}
      placement="right"
      width={440}
      open={!!drawer}
      onClose={closeDrawer}
      destroyOnHidden
    >
      {drawer && currentNovel && (
        <DrawerBody
          key={`${drawer.outputType}:${drawer.chapterId ?? 'new'}`}
          req={drawer}
          novel={currentNovel}
        />
      )}
    </Drawer>
  )
}
