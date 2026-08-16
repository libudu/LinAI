import { useDebounceFn } from 'ahooks'
import {
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Progress,
  Segmented,
  message,
} from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useAppTheme } from '../../../../theme'
import { useNovelConfig } from '../SettingModal/useNovelConfig'
import { DEFAULT_TARGET_LENGTH } from '../service/constants'
import { buildMessages, getDefaultSelection } from '../service/context'
import { CONTEXT_WARN_RATIO, getContextWindow } from '../shared/tokenEstimate'
import type { GenerateModalRequest } from '../store'
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

const MODAL_TITLES: Record<GenerateModalRequest['outputType'], string> = {
  setting: '生成核心设定',
  outline: '生成章节大纲',
  content: '生成章节正文',
}

const INSTRUCTION_PLACEHOLDERS: Record<
  GenerateModalRequest['outputType'],
  string
> = {
  setting: '设定要求（必填），如：参考材料整理一套世界观与主要角色',
  outline: '本章要求（可选），如：本章让两人关系出现裂痕',
  content: '写作要求（可选），如：对话多一些、节奏放慢',
}

// 模态框内容（以 key 强制每次打开重新挂载，从而重置勾选状态）
const GenerateModalBody = ({
  req,
  novel,
}: {
  req: GenerateModalRequest
  novel: Novel
}) => {
  const startGeneration = useNovelStore((s) => s.startGeneration)
  const abortGeneration = useNovelStore((s) => s.abortGeneration)
  const closeGenerateModal = useNovelStore((s) => s.closeGenerateModal)
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
  // 本模态框发起的生成：流式结束后自动关闭（生成在 store 层，关闭模态框不中断）
  const submittedRef = useRef(false)

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

  // 本模态框发起的生成结束后自动关闭（节点出现在画布对应位置）
  useEffect(() => {
    if (submittedRef.current && !streaming) closeGenerateModal()
  }, [streaming, closeGenerateModal])

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
    submittedRef.current = true
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

  // 本模态框对应的流式会话（生成中展示流式文本；估算/勾选区禁用）
  const activeStream =
    streaming &&
    streaming.op === 'generate' &&
    streaming.outputType === req.outputType &&
    streaming.chapterId === (req.chapterId ?? null)
      ? streaming
      : null

  const historyChapters = sortedChapters(novel).filter(
    (c) => c.id !== req.chapterId,
  )
  // 生成正文时本章大纲自动携带（任务段固定注入，勾选仅影响 inputs 溯源）
  const chapterOutline = chapter
    ? findChapterArtifact(novel, chapter.id, 'outline')
    : undefined

  return (
    <div className="space-y-4">
      {activeStream ? (
        /* 流式生成区 */
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>
              生成中
              {activeStream.text &&
                `（${activeStream.text.length.toLocaleString()} 字）`}
              ，关闭窗口不中断
            </span>
            <Button size="small" type="text" danger onClick={abortGeneration}>
              中断
            </Button>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-md border border-slate-200 px-3 py-2 text-sm leading-7 break-words whitespace-pre-wrap text-slate-700">
            {activeStream.text || '等待响应…'}
            <span className="app-accent-bg ml-0.5 inline-block h-4 w-2 animate-pulse align-middle opacity-70" />
          </div>
        </div>
      ) : (
        <>
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
              <span className="text-sm font-medium text-slate-600">
                核心设定
              </span>
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

          {/* 章节（每章：全文 / 仅摘要 / 不带 + 大纲勾选） */}
          <div>
            <div className="mb-1 text-sm font-medium text-slate-600">
              章节
              {req.outputType === 'content' ? (
                <span className="ml-1 text-xs font-normal text-slate-400">
                  （默认之前所有章正文 + 本章大纲，超出最近{' '}
                  {novel.recentFullChapters} 章的更早章节改挂摘要）
                </span>
              ) : (
                <span className="ml-1 text-xs font-normal text-slate-400">
                  （默认最近 {novel.recentFullChapters}{' '}
                  章全文，更早章节摘要，无摘要降级全文）
                </span>
              )}
            </div>
            {req.outputType === 'content' && chapterOutline && (
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Checkbox checked disabled>
                  <span className="text-sm">
                    第 {chapterIndex(novel, chapter!.id)} 章大纲
                  </span>
                  <span className="ml-1 text-xs text-slate-400">自动携带</span>
                </Checkbox>
              </div>
            )}
            {historyChapters.length === 0 ? (
              <div className="text-xs text-slate-400">无历史章节</div>
            ) : (
              <div className="space-y-1.5">
                {historyChapters.map((ch) => {
                  const content = findChapterArtifact(novel, ch.id, 'content')
                  const summary = findChapterArtifact(novel, ch.id, 'summary')
                  const outline = findChapterArtifact(novel, ch.id, 'outline')
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
                      {outline && (
                        <Checkbox
                          checked={artifactIds.includes(outline.id)}
                          onChange={(e) =>
                            toggleArtifact(outline.id, e.target.checked)
                          }
                        >
                          <span className="text-xs text-slate-500">大纲</span>
                        </Checkbox>
                      )}
                      <Segmented
                        size="small"
                        value={chapterModeOf(novel, ch.id, artifactIds)}
                        onChange={(v) =>
                          setArtifactIds((prev) =>
                            withChapterMode(
                              novel,
                              ch.id,
                              prev,
                              v as ChapterMode,
                            ),
                          )
                        }
                        options={[
                          {
                            label: '全文',
                            value: 'full',
                            disabled: !content,
                          },
                          {
                            label: '摘要',
                            value: 'summary',
                            disabled: !summary,
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

          {/* 估算 + 占用比例 + 超量警告 + 提交 */}
          <div className="border-t border-slate-200 pt-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-slate-500">预计上下文占用</span>
              <span
                className={
                  over
                    ? 'text-red-500'
                    : warn
                      ? 'text-amber-500'
                      : 'text-slate-500'
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
        </>
      )}
    </div>
  )
}

// 「生成文段」模态框：点画布加号节点弹出
export const GenerateModal = () => {
  const req = useNovelStore((s) => s.generateModal)
  const closeGenerateModal = useNovelStore((s) => s.closeGenerateModal)
  const currentNovel = useNovelStore((s) => s.currentNovel)

  return (
    <Modal
      title={req ? MODAL_TITLES[req.outputType] : ''}
      width={560}
      open={!!req}
      onCancel={closeGenerateModal}
      footer={null}
      destroyOnHidden
    >
      {req && currentNovel && (
        <GenerateModalBody
          key={`${req.outputType}:${req.chapterId ?? 'new'}`}
          req={req}
          novel={currentNovel}
        />
      )}
    </Modal>
  )
}
