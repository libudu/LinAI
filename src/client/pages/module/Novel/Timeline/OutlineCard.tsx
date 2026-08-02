import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  DownOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { Button, Input, Tooltip } from 'antd'
import { useEffect, useState } from 'react'
import { useNovelStore } from '../store'
import type { Novel, NovelChapter } from '../types'
import { ContextTagBar } from './ContextTagBar'

// 大纲卡：节拍逐条编辑（增删改、上下箭头调序）+ 按指令微调 + 重新生成
export const OutlineCard = ({
  chapter,
  novel,
}: {
  chapter: NovelChapter
  novel: Novel
}) => {
  const {
    collapsed,
    toggleCollapsed,
    editChapter,
    openDrawer,
    startGeneration,
    streaming,
    abortGeneration,
  } = useNovelStore()

  const collapsedKey = `outline:${chapter.id}`
  const isCollapsed = !!collapsed[collapsedKey]
  // 本章正在流式生成大纲时的会话（非空即处于生成中）
  const outlineStream =
    streaming &&
    streaming.target === 'outline' &&
    streaming.chapterId === chapter.id
      ? streaming
      : null

  const outline = chapter.outline
  const [beats, setBeats] = useState<string[]>(outline?.beats ?? [])
  const [tone, setTone] = useState(outline?.tone ?? '')
  const [taboos, setTaboos] = useState(outline?.taboos ?? '')
  const [reviseText, setReviseText] = useState('')

  // 外部（生成落盘/微调）更新大纲后同步回本地编辑态
  useEffect(() => {
    setBeats(outline?.beats ?? [])
    setTone(outline?.tone ?? '')
    setTaboos(outline?.taboos ?? '')
  }, [outline])

  // 提交大纲编辑（空节拍自动丢弃；与现状一致则不提交）
  const commit = (nextBeats = beats, nextTone = tone, nextTaboos = taboos) => {
    const cleaned = nextBeats.map((b) => b.trim()).filter((b) => b.length > 0)
    if (
      outline &&
      cleaned.join('\n') === outline.beats.join('\n') &&
      nextTone === (outline.tone ?? '') &&
      nextTaboos === (outline.taboos ?? '')
    ) {
      return
    }
    setBeats(cleaned)
    editChapter(chapter.id, {
      outline: {
        beats: cleaned,
        tone: nextTone || undefined,
        taboos: nextTaboos || undefined,
      },
    })
  }

  const moveBeat = (i: number, dir: -1 | 1) => {
    const next = [...beats]
    const [x] = next.splice(i, 1)
    next.splice(i + dir, 0, x)
    setBeats(next)
    commit(next)
  }

  const removeBeat = (i: number) => {
    const next = beats.filter((_, j) => j !== i)
    setBeats(next)
    commit(next)
  }

  const handleRevise = (v: string) => {
    const instruction = v.trim()
    if (!instruction || outlineStream) return
    setReviseText('')
    startGeneration({
      kind: 'revise-outline',
      novelId: novel.id,
      chapterId: chapter.id,
      instruction,
    })
  }

  return (
    <div className="rounded-md border border-slate-200">
      {/* 卡头：折叠开关 + 快照标签条 + 重新生成 */}
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2 select-none"
        onClick={() => toggleCollapsed(collapsedKey)}
      >
        <span className="text-xs text-slate-400">
          {isCollapsed ? <RightOutlined /> : <DownOutlined />}
        </span>
        <span className="text-sm font-medium text-slate-600">大纲</span>
        <div className="ml-auto flex items-center gap-1">
          <ContextTagBar snapshot={chapter.outlineContext} novel={novel} />
          <Tooltip title="重新生成大纲（打开上下文抽屉）">
            <Button
              size="small"
              type="text"
              icon={<ReloadOutlined />}
              disabled={!!streaming}
              onClick={(e) => {
                e.stopPropagation()
                openDrawer({ kind: 'outline', chapterId: chapter.id })
              }}
            />
          </Tooltip>
        </div>
      </div>

      {!isCollapsed && (
        <div className="space-y-2 border-t border-slate-100 px-3 py-2">
          {outlineStream ? (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {outlineStream.kind === 'revise-outline'
                    ? '按指令微调大纲中…'
                    : '大纲生成中…'}
                </span>
                {outlineStream && (
                  <Button
                    size="small"
                    type="text"
                    danger
                    onClick={abortGeneration}
                  >
                    中断
                  </Button>
                )}
              </div>
              <div className="text-sm break-words whitespace-pre-wrap text-slate-600">
                {outlineStream.text || '等待响应…'}
              </div>
            </div>
          ) : !outline ? (
            <div className="py-2 text-center">
              <div className="mb-2 text-xs text-slate-400">还没有大纲</div>
              <Button
                size="small"
                type="primary"
                ghost
                disabled={!!streaming}
                onClick={() =>
                  openDrawer({ kind: 'outline', chapterId: chapter.id })
                }
              >
                生成大纲
              </Button>
            </div>
          ) : (
            <>
              {/* 节拍列表 */}
              <div className="space-y-1.5">
                {beats.map((beat, i) => (
                  <div key={i} className="flex items-start gap-1">
                    <span className="mt-1.5 w-5 shrink-0 text-right text-xs text-slate-400">
                      {i + 1}.
                    </span>
                    <Input.TextArea
                      className="flex-1"
                      autoSize
                      value={beat}
                      placeholder="节拍内容"
                      onChange={(e) =>
                        setBeats((prev) =>
                          prev.map((b, j) => (j === i ? e.target.value : b)),
                        )
                      }
                      onBlur={() => commit()}
                    />
                    <div className="flex shrink-0 flex-col">
                      <Button
                        size="small"
                        type="text"
                        icon={<ArrowUpOutlined />}
                        disabled={i === 0}
                        onClick={() => moveBeat(i, -1)}
                      />
                      <Button
                        size="small"
                        type="text"
                        icon={<ArrowDownOutlined />}
                        disabled={i === beats.length - 1}
                        onClick={() => moveBeat(i, 1)}
                      />
                    </div>
                    <Button
                      className="mt-0.5"
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeBeat(i)}
                    />
                  </div>
                ))}
                <Button
                  size="small"
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => setBeats((prev) => [...prev, ''])}
                >
                  添加节拍
                </Button>
              </div>

              {/* 基调 / 禁区 */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs text-slate-400">
                    基调 / 本章目标
                  </div>
                  <Input.TextArea
                    autoSize
                    value={tone}
                    placeholder="（可选）"
                    onChange={(e) => setTone(e.target.value)}
                    onBlur={() => commit()}
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-slate-400">
                    禁区（本章不要发生的事）
                  </div>
                  <Input.TextArea
                    autoSize
                    value={taboos}
                    placeholder="（可选）"
                    onChange={(e) => setTaboos(e.target.value)}
                    onBlur={() => commit()}
                  />
                </div>
              </div>

              {/* 按指令微调 */}
              <Input.Search
                placeholder="按指令修改大纲，如：加强第3节的冲突"
                value={reviseText}
                onChange={(e) => setReviseText(e.target.value)}
                enterButton="微调"
                disabled={!!streaming}
                onSearch={handleRevise}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
