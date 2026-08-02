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
import { useEffect, useMemo, useState } from 'react'
import { useNovelConfig } from '../hooks/useNovelConfig'
import { DEFAULT_TARGET_LENGTH } from '../service/constants'
import { buildMessages } from '../service/context'
import { CONTEXT_WARN_RATIO, getContextWindow } from '../shared/tokenEstimate'
import type { DrawerRequest } from '../store'
import { useNovelStore } from '../store'
import type { ContextSelection, Novel } from '../types'
import { formatTokens } from '../types'

type ChapterMode = 'full' | 'summary' | 'none'

interface SelectionState {
  refIds: string[]
  settingIds: string[]
  chapterModes: Record<string, ChapterMode>
}

// 默认勾选规则（implementation-plan.md 4.1 / 7.2）：
// - 参考文默认不勾、核心设定默认全勾
// - 历史章节默认最近 N 章全文 + 其余摘要（无摘要的降级为全文）；生成目标章自身排除
// - 正文生成入口从该章 outlineContext 快照还原
// - 设定生成的素材是参考文，历史章节默认不带
const computeDefaultSelection = (
  novel: Novel,
  req: DrawerRequest,
): SelectionState => {
  if (req.kind === 'content' && req.chapterId) {
    const chapter = novel.chapters.find((c) => c.id === req.chapterId)
    const snapshot = chapter?.outlineContext
    if (snapshot) {
      const chapterModes: Record<string, ChapterMode> = {}
      snapshot.fullChapterIds.forEach((id) => {
        chapterModes[id] = 'full'
      })
      snapshot.summaryChapterIds.forEach((id) => {
        chapterModes[id] = 'summary'
      })
      return {
        refIds: [...snapshot.refIds],
        settingIds: [...snapshot.settingIds],
        chapterModes,
      }
    }
  }

  const chapterModes: Record<string, ChapterMode> = {}
  if (req.kind !== 'setting') {
    const history = novel.chapters
      .filter((c) => c.id !== req.chapterId)
      .sort((a, b) => a.index - b.index)
    history.forEach((c, i) => {
      const fromEnd = history.length - i // 倒数第几章（1 起）
      if (fromEnd <= novel.recentFullChapters || !c.summary) {
        chapterModes[c.id] = 'full'
      } else {
        chapterModes[c.id] = 'summary'
      }
    })
  }
  return {
    refIds: [],
    settingIds: novel.settings.map((s) => s.id),
    chapterModes,
  }
}

const DRAWER_TITLES: Record<DrawerRequest['kind'], string> = {
  setting: '生成核心设定',
  outline: '生成章节大纲',
  content: '生成章节正文',
}

const INSTRUCTION_PLACEHOLDERS: Record<DrawerRequest['kind'], string> = {
  setting: '设定要求（必填），如：参考材料整理一套世界观与主要角色',
  outline: '本章要求（可选），如：本章让两人关系出现裂痕',
  content: '写作要求（可选），如：对话多一些、节奏放慢',
}

// 抽屉内容（以 key 强制每次打开重新挂载，从而重置勾选状态）
const DrawerBody = ({ req, novel }: { req: DrawerRequest; novel: Novel }) => {
  const startGeneration = useNovelStore((s) => s.startGeneration)
  const closeDrawer = useNovelStore((s) => s.closeDrawer)
  const streaming = useNovelStore((s) => s.streaming)

  const [selection, setSelection] = useState<SelectionState>(() =>
    computeDefaultSelection(novel, req),
  )
  const [instruction, setInstruction] = useState('')
  const [targetLength, setTargetLength] = useState<number | null>(
    DEFAULT_TARGET_LENGTH,
  )
  const [estimate, setEstimate] = useState<{
    estimatedTokens: number
    contextWindow: number
  } | null>(null)

  const apiSelection = useMemo<ContextSelection>(
    () => ({
      refIds: selection.refIds,
      settingIds: selection.settingIds,
      fullChapterIds: Object.keys(selection.chapterModes).filter(
        (id) => selection.chapterModes[id] === 'full',
      ),
      summaryChapterIds: Object.keys(selection.chapterModes).filter(
        (id) => selection.chapterModes[id] === 'summary',
      ),
    }),
    [selection],
  )

  // 实时 token 估算（防抖 300ms），本地组装上下文估算，失败静默
  const novelModelId = useNovelConfig((s) => s.novelModelId)
  const { run: runEstimate } = useDebounceFn(
    async (sel: ContextSelection, instr: string) => {
      try {
        const chapter = req.chapterId
          ? novel.chapters.find((c) => c.id === req.chapterId)
          : undefined
        const { snapshot } = await buildMessages({
          novel,
          kind: req.kind,
          chapter,
          selection: sel,
          instruction: instr || undefined,
        })
        setEstimate({
          estimatedTokens: snapshot.estimatedTokens,
          contextWindow: getContextWindow(novelModelId),
        })
      } catch {
        // 忽略估算错误
      }
    },
    { wait: 300 },
  )
  useEffect(() => {
    runEstimate(apiSelection, instruction)
  }, [apiSelection, instruction, runEstimate])

  const setChapterMode = (id: string, mode: ChapterMode) =>
    setSelection((prev) => ({
      ...prev,
      chapterModes: { ...prev.chapterModes, [id]: mode },
    }))

  const toggleRef = (id: string, checked: boolean) =>
    setSelection((prev) => ({
      ...prev,
      refIds: checked
        ? [...prev.refIds, id]
        : prev.refIds.filter((x) => x !== id),
    }))

  const toggleSetting = (id: string, checked: boolean) =>
    setSelection((prev) => ({
      ...prev,
      settingIds: checked
        ? [...prev.settingIds, id]
        : prev.settingIds.filter((x) => x !== id),
    }))

  const percent = estimate
    ? (estimate.estimatedTokens / estimate.contextWindow) * 100
    : 0
  const over = percent > 100
  const warn = !over && percent > CONTEXT_WARN_RATIO * 100

  const handleSubmit = async () => {
    const instr = instruction.trim()
    if (req.kind === 'setting' && !instr) {
      message.warning('请填写设定要求')
      return
    }
    closeDrawer()
    if (req.kind === 'setting') {
      await startGeneration({
        kind: 'setting',
        novelId: novel.id,
        instruction: instr,
        selection: apiSelection,
      })
    } else if (req.kind === 'outline') {
      await startGeneration({
        kind: 'outline',
        novelId: novel.id,
        chapterId: req.chapterId,
        instruction: instr || undefined,
        selection: apiSelection,
      })
    } else {
      await startGeneration({
        kind: 'content',
        novelId: novel.id,
        chapterId: req.chapterId!,
        instruction: instr || undefined,
        selection: apiSelection,
        targetLength: targetLength ?? undefined,
      })
    }
  }

  const historyChapters = novel.chapters
    .filter((c) => c.id !== req.chapterId)
    .sort((a, b) => a.index - b.index)

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
        {/* 参考文（默认不勾） */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">参考文</span>
            {novel.refs.length > 0 && (
              <Button
                type="link"
                size="small"
                onClick={() =>
                  setSelection((prev) => ({
                    ...prev,
                    refIds:
                      prev.refIds.length === novel.refs.length
                        ? []
                        : novel.refs.map((r) => r.id),
                  }))
                }
              >
                {selection.refIds.length === novel.refs.length
                  ? '清空'
                  : '全选'}
              </Button>
            )}
          </div>
          {novel.refs.length === 0 ? (
            <div className="text-xs text-slate-400">无参考文</div>
          ) : (
            <div className="space-y-1">
              {novel.refs.map((ref) => (
                <div key={ref.id}>
                  <Checkbox
                    checked={selection.refIds.includes(ref.id)}
                    onChange={(e) => toggleRef(ref.id, e.target.checked)}
                  >
                    <span className="text-sm">{ref.title}</span>
                    <span className="ml-1 text-xs text-slate-400">
                      {ref.storedLength.toLocaleString()} 字
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
            {novel.settings.length > 0 && (
              <Button
                type="link"
                size="small"
                onClick={() =>
                  setSelection((prev) => ({
                    ...prev,
                    settingIds:
                      prev.settingIds.length === novel.settings.length
                        ? []
                        : novel.settings.map((s) => s.id),
                  }))
                }
              >
                {selection.settingIds.length === novel.settings.length
                  ? '清空'
                  : '全选'}
              </Button>
            )}
          </div>
          {novel.settings.length === 0 ? (
            <div className="text-xs text-slate-400">无核心设定</div>
          ) : (
            <div className="space-y-1">
              {novel.settings.map((setting) => (
                <div key={setting.id}>
                  <Checkbox
                    checked={selection.settingIds.includes(setting.id)}
                    onChange={(e) =>
                      toggleSetting(setting.id, e.target.checked)
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
              {historyChapters.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    第 {ch.index} 章
                    {ch.title && (
                      <span className="ml-1 text-xs text-slate-400">
                        {ch.title}
                      </span>
                    )}
                  </span>
                  <Segmented
                    size="small"
                    value={selection.chapterModes[ch.id] ?? 'none'}
                    onChange={(v) => setChapterMode(ch.id, v as ChapterMode)}
                    options={[
                      { label: '全文', value: 'full' },
                      {
                        label: '摘要',
                        value: 'summary',
                        disabled: !ch.summary,
                      },
                      { label: '不带', value: 'none' },
                    ]}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 指令 */}
        <div>
          <div className="mb-1 text-sm font-medium text-slate-600">
            {req.kind === 'setting' ? '设定要求' : '附加要求'}
          </div>
          <Input.TextArea
            rows={3}
            placeholder={INSTRUCTION_PLACEHOLDERS[req.kind]}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
        </div>

        {req.kind === 'content' && (
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
          strokeColor={over ? '#ff4d4f' : warn ? '#faad14' : '#EC883A'}
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

// 上下文选择抽屉：点生成时从右侧弹出（implementation-plan.md 7.2）
export const ContextDrawer = () => {
  const drawer = useNovelStore((s) => s.drawer)
  const closeDrawer = useNovelStore((s) => s.closeDrawer)
  const currentNovel = useNovelStore((s) => s.currentNovel)

  return (
    <Drawer
      title={drawer ? DRAWER_TITLES[drawer.kind] : ''}
      placement="right"
      width={440}
      open={!!drawer}
      onClose={closeDrawer}
      destroyOnHidden
    >
      {drawer && currentNovel && (
        <DrawerBody
          key={`${drawer.kind}:${drawer.chapterId ?? 'new'}`}
          req={drawer}
          novel={currentNovel}
        />
      )}
    </Drawer>
  )
}
