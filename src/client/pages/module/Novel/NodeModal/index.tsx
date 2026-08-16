import { DeleteOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons'
import {
  Button,
  Input,
  Modal,
  Popconfirm,
  Popover,
  Tag,
  Tooltip,
  message,
} from 'antd'
import { useEffect, useState } from 'react'
import {
  ARTIFACT_TAG_COLORS,
  ARTIFACT_TYPE_LABELS,
  artifactNodeTitle,
} from '../Canvas/NodeCard'
import { ContextTagBar } from '../components/ContextTagBar'
import { useNovelStore } from '../store'
import type { Novel, NovelArtifact } from '../types'
import { findChapterArtifact, sortedChapters } from '../types'

// 节点模态框内容（以 key=artifactId 强制切换节点时重新挂载，重置本地编辑态）
const NodeModalBody = ({
  novel,
  artifact,
}: {
  novel: Novel
  artifact: NovelArtifact
}) => {
  const updateArtifact = useNovelStore((s) => s.updateArtifact)
  const deleteArtifact = useNovelStore((s) => s.deleteArtifact)
  const editChapterTitle = useNovelStore((s) => s.editChapterTitle)
  const removeChapter = useNovelStore((s) => s.removeChapter)
  const startGeneration = useNovelStore((s) => s.startGeneration)
  const abortGeneration = useNovelStore((s) => s.abortGeneration)
  const streaming = useNovelStore((s) => s.streaming)
  const closeNodeModal = useNovelStore((s) => s.closeNodeModal)
  const openGenerateModal = useNovelStore((s) => s.openGenerateModal)

  // 手动编辑草稿（外部更新落盘后同步回本地）
  const [draft, setDraft] = useState(artifact.content)
  useEffect(() => {
    setDraft(artifact.content)
  }, [artifact.content])

  // 章节标题编辑（仅大纲节点）
  const chapter = artifact.chapterId
    ? novel.chapters.find((c) => c.id === artifact.chapterId)
    : undefined
  const chapters = sortedChapters(novel)
  const isLastChapter =
    !!chapter && chapters[chapters.length - 1]?.id === chapter.id

  // 对话区：本地待落盘的指令（发送即显示，落盘刷新后由 messages 接管）
  const [pending, setPending] = useState<string[]>([])
  useEffect(() => {
    setPending([])
  }, [artifact.messages.length])
  const [instruction, setInstruction] = useState('')
  // 长回复默认折叠（assistant 回复是修改后的全文）
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  // 续写 / 选段重写（仅正文节点）
  const [continueOpen, setContinueOpen] = useState(false)
  const [continueText, setContinueText] = useState('')
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null)
  const [rewriteOpen, setRewriteOpen] = useState(false)
  const [rewriteText, setRewriteText] = useState('')

  // 摘要（仅正文节点）
  const summaryArtifact = chapter
    ? findChapterArtifact(novel, chapter.id, 'summary')
    : undefined
  const [summaryEditing, setSummaryEditing] = useState(false)
  const [summaryDraft, setSummaryDraft] = useState('')

  // 本节点的流式会话（revise / continue / rewrite-range / 正文重新生成）
  const activeStream =
    streaming &&
    (streaming.targetId === artifact.id ||
      (streaming.op === 'generate' &&
        streaming.chapterId === (artifact.chapterId ?? null) &&
        streaming.target === artifact.type))
      ? streaming
      : null
  const summaryStream =
    streaming &&
    streaming.op === 'generate' &&
    streaming.target === 'summary' &&
    streaming.chapterId === (artifact.chapterId ?? null)
      ? streaming
      : null

  const dirty = draft !== artifact.content

  const saveManualEdit = async () => {
    if (!draft.trim()) {
      message.warning('内容不能为空')
      return
    }
    await updateArtifact(artifact.id, { content: draft })
  }

  const handleSend = () => {
    const instr = instruction.trim()
    if (!instr || streaming) return
    setInstruction('')
    setPending((prev) => [...prev, instr])
    // 节点对话 = 按指令整体修改本节点（revise）；指令与回复都记入该文段 messages
    startGeneration({
      op: 'revise',
      novelId: novel.id,
      targetId: artifact.id,
      instruction: instr,
    })
  }

  const handleContinue = () => {
    setContinueOpen(false)
    startGeneration({
      op: 'continue',
      novelId: novel.id,
      targetId: artifact.id,
      instruction: continueText.trim() || undefined,
    })
    setContinueText('')
  }

  const handleRewrite = async () => {
    if (!sel || !rewriteText.trim()) {
      message.warning('请填写重写要求')
      return
    }
    const range = { start: sel.start, end: sel.end }
    setRewriteOpen(false)
    setSel(null)
    await startGeneration({
      op: 'rewrite-range',
      novelId: novel.id,
      targetId: artifact.id,
      instruction: rewriteText.trim(),
      range,
    })
    setRewriteText('')
  }

  // 正文选区（TextArea 原生 selectionStart/End 即字符偏移）
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget
    if (t.selectionStart < t.selectionEnd) {
      setSel({ start: t.selectionStart, end: t.selectionEnd })
    } else {
      setSel(null)
    }
  }

  const saveSummary = async () => {
    if (!summaryArtifact) return
    const ok = await updateArtifact(summaryArtifact.id, {
      content: summaryDraft,
    })
    if (ok) setSummaryEditing(false)
  }

  const isChapterArtifact =
    artifact.type === 'outline' || artifact.type === 'content'

  return (
    <div className="space-y-4">
      {/* 头部：溯源标签 + 章节标题（大纲节点可改名） */}
      <div className="flex flex-wrap items-center gap-2">
        <ContextTagBar artifact={artifact} novel={novel} />
        {artifact.type === 'outline' && chapter && (
          <Input
            size="small"
            className="max-w-52"
            placeholder="章节标题"
            defaultValue={chapter.title}
            onBlur={(e) => {
              const title = e.target.value.trim()
              if (title !== chapter.title) editChapterTitle(chapter.id, title)
            }}
          />
        )}
      </div>

      {/* 文段内容（可手动编辑，保存即 version+1；生成中显示流式文本） */}
      <div>
        {activeStream ? (
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span>
                生成中
                {activeStream.text &&
                  `（${activeStream.text.length.toLocaleString()} 字）`}
              </span>
              <Button size="small" type="text" danger onClick={abortGeneration}>
                中断
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto text-sm leading-7 break-words whitespace-pre-wrap text-slate-700">
              {activeStream.text || '等待响应…'}
              <span className="app-accent-bg ml-0.5 inline-block h-4 w-2 animate-pulse align-middle opacity-70" />
            </div>
          </div>
        ) : (
          <>
            <Input.TextArea
              value={draft}
              autoSize={{ minRows: 6, maxRows: 16 }}
              onChange={(e) => setDraft(e.target.value)}
              onSelect={
                artifact.type === 'content' && !dirty ? handleSelect : undefined
              }
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {dirty && (
                <Button size="small" type="primary" onClick={saveManualEdit}>
                  保存修改
                </Button>
              )}
              {artifact.type === 'content' && (
                <>
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
                  <Button
                    size="small"
                    disabled={!!streaming || !sel || dirty}
                    onClick={() => setRewriteOpen(true)}
                  >
                    重写选中段落
                    {sel ? `（${sel.end - sel.start} 字）` : ''}
                  </Button>
                </>
              )}
              {isChapterArtifact && (
                <Tooltip title="按默认/自选上下文重新生成">
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    disabled={!!streaming}
                    onClick={() => {
                      closeNodeModal()
                      openGenerateModal({
                        outputType: artifact.type as 'outline' | 'content',
                        chapterId: artifact.chapterId,
                      })
                    }}
                  >
                    重新生成
                  </Button>
                </Tooltip>
              )}
              <span className="ml-auto text-xs text-slate-400">
                {artifact.content.length.toLocaleString()} 字 · v
                {artifact.version}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 对话区：该文段的 messages 历史（沙箱规则：只服务本节点修改，不流入下游生成） */}
      <div className="rounded-md border border-slate-200">
        <div className="border-b border-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500">
          节点对话
          <span className="ml-1 font-normal text-slate-400">
            （修改指令只作用于本文段）
          </span>
        </div>
        <div className="max-h-56 space-y-2 overflow-y-auto px-3 py-2">
          {artifact.messages.length === 0 && pending.length === 0 && (
            <div className="text-xs text-slate-400">
              还没有对话，发送修改指令开始（如：加强第 3 节的冲突）
            </div>
          )}
          {artifact.messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-md px-2.5 py-1.5 text-xs leading-5 break-words whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'app-accent-surface ml-8 text-slate-700'
                  : 'mr-8 bg-slate-50 text-slate-600'
              }`}
            >
              {m.role === 'assistant' &&
              !expanded[i] &&
              m.content.length > 200 ? (
                <>
                  <span className="line-clamp-4">{m.content}</span>
                  <Button
                    type="link"
                    size="small"
                    className="px-0"
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [i]: true }))
                    }
                  >
                    展开全文
                  </Button>
                </>
              ) : (
                m.content
              )}
            </div>
          ))}
          {pending.map((p, i) => (
            <div
              key={`pending-${i}`}
              className="app-accent-surface ml-8 rounded-md px-2.5 py-1.5 text-xs leading-5 break-words whitespace-pre-wrap text-slate-700"
            >
              {p}
            </div>
          ))}
          {activeStream && streaming?.targetId === artifact.id && (
            <div className="mr-8 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs leading-5 break-words whitespace-pre-wrap text-slate-600">
              {activeStream.text || '等待响应…'}
            </div>
          )}
        </div>
        <div className="flex items-end gap-2 border-t border-slate-100 px-3 py-2">
          <Input.TextArea
            autoSize={{ minRows: 1, maxRows: 4 }}
            placeholder="修改指令，如：整体压缩到两千字、对话更口语化"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <Button
            type="primary"
            size="small"
            icon={<SendOutlined />}
            disabled={!!streaming || !instruction.trim()}
            onClick={handleSend}
          >
            发送
          </Button>
        </div>
      </div>

      {/* 摘要（仅正文节点；摘要不是画布节点，在这里维护） */}
      {artifact.type === 'content' && chapter && (
        <div className="rounded-md bg-slate-50 p-2">
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
                <Button size="small" onClick={() => setSummaryEditing(false)}>
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
      )}

      {/* 删除：仅最后一章的大纲/正文可删（沿用约束）；设定任意可删 */}
      {(isLastChapter && isChapterArtifact) || artifact.type === 'setting' ? (
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Popconfirm
            title={`删除该${ARTIFACT_TYPE_LABELS[artifact.type]}？`}
            onConfirm={async () => {
              const ok = await deleteArtifact(artifact.id)
              if (ok) closeNodeModal()
            }}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除{ARTIFACT_TYPE_LABELS[artifact.type]}
            </Button>
          </Popconfirm>
          {artifact.type === 'outline' && isLastChapter && chapter && (
            <Popconfirm
              title="删除本章？"
              description="仅可删除最后一章，将同时删除其大纲、正文与摘要"
              onConfirm={async () => {
                const ok = await removeChapter(chapter.id)
                if (ok) closeNodeModal()
              }}
            >
              <Button size="small" danger type="primary">
                删除本章
              </Button>
            </Popconfirm>
          )}
        </div>
      ) : null}

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
            {sel ? artifact.content.slice(sel.start, sel.end) : ''}
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

// 「节点」模态框：点画布已有节点弹出
export const NodeModal = () => {
  const artifactId = useNovelStore((s) => s.nodeModalId)
  const closeNodeModal = useNovelStore((s) => s.closeNodeModal)
  const currentNovel = useNovelStore((s) => s.currentNovel)
  const artifact = currentNovel?.artifacts.find((a) => a.id === artifactId)

  // 文段被删除（如删章节级联）后自动关闭
  useEffect(() => {
    if (artifactId && currentNovel && !artifact) closeNodeModal()
  }, [artifactId, currentNovel, artifact, closeNodeModal])

  return (
    <Modal
      title={
        artifact && currentNovel ? (
          <span className="flex items-center gap-2">
            <Tag color={ARTIFACT_TAG_COLORS[artifact.type]} className="mr-0">
              {ARTIFACT_TYPE_LABELS[artifact.type]}
            </Tag>
            {artifactNodeTitle(currentNovel, artifact)}
          </span>
        ) : (
          ''
        )
      }
      width={760}
      open={!!artifactId}
      onCancel={closeNodeModal}
      footer={null}
      destroyOnHidden
    >
      {artifact && currentNovel && (
        <NodeModalBody
          key={artifact.id}
          novel={currentNovel}
          artifact={artifact}
        />
      )}
    </Modal>
  )
}
