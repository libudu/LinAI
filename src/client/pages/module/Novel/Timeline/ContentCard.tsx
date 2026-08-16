import {
  DownOutlined,
  EditOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons'
import {
  Button,
  Input,
  Modal,
  Popconfirm,
  Popover,
  Tooltip,
  message,
} from 'antd'
import { useRef, useState } from 'react'
import { useNovelStore } from '../store'
import type { ArtifactOperation, Novel, NovelChapter } from '../types'
import { findChapterArtifact } from '../types'
import { ContextTagBar } from './ContextTagBar'

// 流式生成中各操作的提示语
const STREAMING_LABELS: Partial<Record<ArtifactOperation, string>> = {
  generate: '正文生成中…',
  continue: '续写中…',
  revise: '按指令微调中…',
  'rewrite-range': '重写选中段落中…',
}

// 正文卡：流式渲染 / 续写 / 选段重写 / 按指令微调 / 手动编辑 / 摘要
export const ContentCard = ({
  chapter,
  novel,
}: {
  chapter: NovelChapter
  novel: Novel
}) => {
  const {
    collapsed,
    toggleCollapsed,
    updateArtifact,
    openDrawer,
    startGeneration,
    streaming,
    abortGeneration,
  } = useNovelStore()

  const collapsedKey = `content:${chapter.id}`
  const isCollapsed = !!collapsed[collapsedKey]
  // 本章正在流式生成正文 / 摘要时的会话（非空即处于生成中）
  const contentStream =
    streaming &&
    streaming.target === 'content' &&
    streaming.chapterId === chapter.id
      ? streaming
      : null
  const summaryStream =
    streaming &&
    streaming.target === 'summary' &&
    streaming.chapterId === chapter.id
      ? streaming
      : null

  // 手动编辑
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  // 续写 / 微调的可选指令
  const [continueOpen, setContinueOpen] = useState(false)
  const [continueText, setContinueText] = useState('')
  const [reviseOpen, setReviseOpen] = useState(false)
  const [reviseText, setReviseText] = useState('')

  // 选段重写：正文上的字符偏移区间 + 浮层位置
  const contentRef = useRef<HTMLDivElement>(null)
  const [sel, setSel] = useState<{
    start: number
    end: number
    x: number
    y: number
  } | null>(null)
  const [rewriteOpen, setRewriteOpen] = useState(false)
  const [rewriteText, setRewriteText] = useState('')

  // 摘要编辑
  const [summaryEditing, setSummaryEditing] = useState(false)
  const [summaryDraft, setSummaryDraft] = useState('')

  const outline = findChapterArtifact(novel, chapter.id, 'outline')
  const contentArtifact = findChapterArtifact(novel, chapter.id, 'content')
  const summaryArtifact = findChapterArtifact(novel, chapter.id, 'summary')
  const content = contentArtifact?.content ?? ''

  // 从 window.getSelection 换算正文字符偏移（容器内为纯文本节点）
  const handleMouseUp = () => {
    const container = contentRef.current
    const selection = window.getSelection()
    if (!container || !selection || selection.isCollapsed) {
      setSel(null)
      return
    }
    const range = selection.getRangeAt(0)
    if (!container.contains(range.commonAncestorContainer)) {
      setSel(null)
      return
    }
    const pre = range.cloneRange()
    pre.selectNodeContents(container)
    pre.setEnd(range.startContainer, range.startOffset)
    const start = pre.toString().length
    const end = start + range.toString().length
    if (end <= start) {
      setSel(null)
      return
    }
    const rect = range.getBoundingClientRect()
    const cRect = container.getBoundingClientRect()
    setSel({
      start,
      end,
      x: rect.left - cRect.left + rect.width / 2,
      y: rect.top - cRect.top,
    })
  }

  const handleRewrite = async () => {
    if (!sel || !rewriteText.trim()) {
      message.warning('请填写重写要求')
      return
    }
    if (!contentArtifact) return
    const range = { start: sel.start, end: sel.end }
    setRewriteOpen(false)
    setSel(null)
    window.getSelection()?.removeAllRanges()
    await startGeneration({
      op: 'rewrite-range',
      novelId: novel.id,
      targetId: contentArtifact.id,
      instruction: rewriteText.trim(),
      range,
    })
    setRewriteText('')
  }

  const handleContinue = () => {
    if (!contentArtifact) return
    setContinueOpen(false)
    startGeneration({
      op: 'continue',
      novelId: novel.id,
      targetId: contentArtifact.id,
      instruction: continueText.trim() || undefined,
    })
    setContinueText('')
  }

  const handleRevise = () => {
    if (!reviseText.trim()) {
      message.warning('请填写修改指令')
      return
    }
    if (!contentArtifact) return
    setReviseOpen(false)
    startGeneration({
      op: 'revise',
      novelId: novel.id,
      targetId: contentArtifact.id,
      instruction: reviseText.trim(),
    })
    setReviseText('')
  }

  const saveManualEdit = async () => {
    if (!contentArtifact) return
    const ok = await updateArtifact(contentArtifact.id, { content: draft })
    if (ok) setEditing(false)
  }

  const saveSummary = async () => {
    if (!summaryArtifact) return
    const ok = await updateArtifact(summaryArtifact.id, {
      content: summaryDraft,
    })
    if (ok) setSummaryEditing(false)
  }

  return (
    <div className="rounded-md border border-slate-200">
      {/* 卡头 */}
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2 select-none"
        onClick={() => toggleCollapsed(collapsedKey)}
      >
        <span className="text-xs text-slate-400">
          {isCollapsed ? <RightOutlined /> : <DownOutlined />}
        </span>
        <span className="text-sm font-medium text-slate-600">正文</span>
        {content && (
          <span className="text-xs text-slate-400">
            {content.length.toLocaleString()} 字
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <ContextTagBar artifact={contentArtifact} novel={novel} />
          {content && (
            <Tooltip title="重新生成正文（打开上下文抽屉）">
              <Button
                size="small"
                type="text"
                icon={<ReloadOutlined />}
                disabled={!!streaming}
                onClick={(e) => {
                  e.stopPropagation()
                  openDrawer({ outputType: 'content', chapterId: chapter.id })
                }}
              />
            </Tooltip>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="border-t border-slate-100 px-3 py-2">
          {contentStream ? (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {STREAMING_LABELS[contentStream.op] ?? '生成中…'}
                  {contentStream.text &&
                    `（${contentStream.text.length.toLocaleString()} 字）`}
                </span>
                <Button
                  size="small"
                  type="text"
                  danger
                  onClick={abortGeneration}
                >
                  中断
                </Button>
              </div>
              <div className="text-sm leading-7 break-words whitespace-pre-wrap text-slate-700">
                {contentStream.text || '等待响应…'}
                <span className="app-accent-bg ml-0.5 inline-block h-4 w-2 animate-pulse align-middle opacity-70" />
              </div>
            </div>
          ) : !content ? (
            <div className="py-2 text-center">
              <div className="mb-2 text-xs text-slate-400">还没有正文</div>
              <Tooltip title={outline ? '' : '请先生成大纲'}>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  disabled={!!streaming || !outline}
                  onClick={() =>
                    openDrawer({ outputType: 'content', chapterId: chapter.id })
                  }
                >
                  生成正文
                </Button>
              </Tooltip>
            </div>
          ) : editing ? (
            <div className="space-y-2">
              <Input.TextArea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoSize={{ minRows: 10 }}
              />
              <div className="flex justify-end gap-2">
                <Button size="small" onClick={() => setEditing(false)}>
                  取消
                </Button>
                <Button size="small" type="primary" onClick={saveManualEdit}>
                  保存
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* 正文展示（选中段落弹出「重写此段」浮层） */}
              <div className="relative">
                <div
                  ref={contentRef}
                  className="text-sm leading-7 break-words whitespace-pre-wrap text-slate-700"
                  onMouseUp={handleMouseUp}
                >
                  {content}
                </div>
                {sel && !streaming && (
                  <div
                    className="absolute z-10"
                    style={{
                      left: sel.x,
                      top: sel.y,
                      transform: 'translate(-50%, -110%)',
                    }}
                  >
                    <Button
                      size="small"
                      type="primary"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setRewriteOpen(true)}
                    >
                      重写此段
                    </Button>
                  </div>
                )}
              </div>

              {/* 操作栏 */}
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                <Popover
                  open={continueOpen}
                  onOpenChange={setContinueOpen}
                  trigger="click"
                  placement="topLeft"
                  content={
                    <div className="w-72 space-y-2">
                      <Input.TextArea
                        rows={3}
                        placeholder="续写要求（可选），如：加快节奏进入冲突"
                        value={continueText}
                        onChange={(e) => setContinueText(e.target.value)}
                      />
                      <Button
                        type="primary"
                        size="small"
                        block
                        onClick={handleContinue}
                      >
                        开始续写
                      </Button>
                    </div>
                  }
                >
                  <Button size="small" disabled={!!streaming}>
                    继续写
                  </Button>
                </Popover>
                <Popover
                  open={reviseOpen}
                  onOpenChange={setReviseOpen}
                  trigger="click"
                  placement="topLeft"
                  content={
                    <div className="w-72 space-y-2">
                      <Input.TextArea
                        rows={3}
                        placeholder="修改指令，如：整体压缩到两千字、对话更口语化"
                        value={reviseText}
                        onChange={(e) => setReviseText(e.target.value)}
                      />
                      <Button
                        type="primary"
                        size="small"
                        block
                        onClick={handleRevise}
                      >
                        按指令微调
                      </Button>
                    </div>
                  }
                >
                  <Button size="small" disabled={!!streaming}>
                    按指令修改
                  </Button>
                </Popover>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  disabled={!!streaming}
                  onClick={() => {
                    setDraft(content)
                    setEditing(true)
                  }}
                >
                  手动编辑
                </Button>
              </div>

              {/* 摘要 */}
              <div className="mt-3 rounded-md bg-slate-50 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    章节摘要
                    <span className="ml-1 font-normal text-slate-400">
                      （供后续章节上下文使用）
                    </span>
                  </span>
                  {summaryArtifact && !summaryEditing && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="small"
                        type="text"
                        onClick={() => {
                          setSummaryDraft(summaryArtifact.content)
                          setSummaryEditing(true)
                        }}
                      >
                        编辑
                      </Button>
                      <Popconfirm
                        title="重新生成摘要？"
                        onConfirm={() =>
                          startGeneration({
                            op: 'generate',
                            outputType: 'summary',
                            novelId: novel.id,
                            chapterId: chapter.id,
                          })
                        }
                      >
                        <Button size="small" type="text" disabled={!!streaming}>
                          重新生成
                        </Button>
                      </Popconfirm>
                    </div>
                  )}
                </div>
                {summaryStream ? (
                  <div className="text-xs text-slate-500">
                    摘要生成中… {summaryStream.text}
                  </div>
                ) : summaryEditing ? (
                  <div className="space-y-2">
                    <Input.TextArea
                      value={summaryDraft}
                      onChange={(e) => setSummaryDraft(e.target.value)}
                      autoSize={{ minRows: 3 }}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="small"
                        onClick={() => setSummaryEditing(false)}
                      >
                        取消
                      </Button>
                      <Button size="small" type="primary" onClick={saveSummary}>
                        保存
                      </Button>
                    </div>
                  </div>
                ) : summaryArtifact ? (
                  <div className="text-xs leading-6 break-words whitespace-pre-wrap text-slate-600">
                    {summaryArtifact.content}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-amber-600">
                    摘要未生成，后续章节上下文会退化为携带本章全文
                    <Button
                      size="small"
                      disabled={!!streaming}
                      onClick={() =>
                        startGeneration({
                          op: 'generate',
                          outputType: 'summary',
                          novelId: novel.id,
                          chapterId: chapter.id,
                        })
                      }
                    >
                      生成摘要
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 选段重写指令弹窗 */}
      <Modal
        title="重写选中段落"
        open={rewriteOpen}
        onCancel={() => setRewriteOpen(false)}
        onOk={handleRewrite}
        okText="重写"
        destroyOnHidden
      >
        <div className="space-y-3">
          <div className="max-h-32 overflow-y-auto rounded bg-slate-50 p-2 text-xs break-words whitespace-pre-wrap text-slate-500">
            {sel ? content.slice(sel.start, sel.end) : ''}
          </div>
          <Input.TextArea
            rows={3}
            placeholder="重写要求，如：扩写这段的心理描写"
            value={rewriteText}
            onChange={(e) => setRewriteText(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  )
}
