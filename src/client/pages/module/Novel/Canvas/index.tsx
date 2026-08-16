import { Empty, Spin } from 'antd'
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNovelStore } from '../store'
import type { NovelArtifact } from '../types'
import { findChapterArtifact, sortedChapters } from '../types'
import {
  contentPlusId,
  deriveEdges,
  OUTLINE_PLUS_ID,
  outlinePlusId,
  recommendedPlusId,
  type CanvasEdge,
} from './edges'
import { NodeCard, PlusNode } from './NodeCard'

interface EdgePath {
  id: string
  d: string
  kind: CanvasEdge['kind']
}

// 工作区画布：左列大纲链 + 右列正文链（每章一行两格，确定性布局，不用画布库），
// 绝对定位 SVG 层画连线（锚点渲染后测量，resize / 节点增删时重算）
export const Canvas = () => {
  const currentNovel = useNovelStore((s) => s.currentNovel)
  const loadingNovel = useNovelStore((s) => s.loadingNovel)
  const streaming = useNovelStore((s) => s.streaming)
  const nodeModalId = useNovelStore((s) => s.nodeModalId)
  const openNodeModal = useNovelStore((s) => s.openNodeModal)
  const openGenerateModal = useNovelStore((s) => s.openGenerateModal)

  const containerRef = useRef<HTMLDivElement>(null)
  const [paths, setPaths] = useState<EdgePath[]>([])

  const novel = currentNovel
  const edges = useMemo(() => (novel ? deriveEdges(novel) : []), [novel])

  // 选中节点（节点模态框打开中）的 inputs 来源高亮连线（仅画布上的大纲/正文节点有锚点）
  const inputEdges = useMemo<CanvasEdge[]>(() => {
    if (!novel || !nodeModalId) return []
    const artifact = novel.artifacts.find((a) => a.id === nodeModalId)
    if (!artifact) return []
    return artifact.inputs
      .filter((id) => {
        const src = novel.artifacts.find((a) => a.id === id)
        return src && (src.type === 'outline' || src.type === 'content')
      })
      .map((id) => ({
        id: `input:${id}`,
        from: id,
        to: artifact.id,
        kind: 'input' as const,
      }))
  }, [novel, nodeModalId])

  const allEdges = useMemo(() => [...edges, ...inputEdges], [edges, inputEdges])

  // 渲染后测量卡片锚点，算出全部连线路径
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const recalc = () => {
      const cRect = container.getBoundingClientRect()
      const next: EdgePath[] = []
      for (const e of allEdges) {
        const fromEl = container.querySelector(`[data-node-id="${e.from}"]`)
        const toEl = container.querySelector(`[data-node-id="${e.to}"]`)
        if (!fromEl || !toEl) continue
        const f = fromEl.getBoundingClientRect()
        const t = toEl.getBoundingClientRect()
        let d: string
        if (e.kind === 'v') {
          // 纵向：底边中点 → 顶边中点
          const x1 = f.left - cRect.left + f.width / 2
          const y1 = f.bottom - cRect.top
          const x2 = t.left - cRect.left + t.width / 2
          const y2 = t.top - cRect.top
          const dy = Math.max(24, (y2 - y1) / 2)
          d = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`
        } else {
          // 横向 / 来源高亮：右边中点 → 左边中点（来源在右侧时反向）
          const x1 = f.right - cRect.left
          const y1 = f.top - cRect.top + f.height / 2
          const x2 = t.left - cRect.left
          const y2 = t.top - cRect.top + t.height / 2
          const sign = x2 >= x1 ? 1 : -1
          const dx = Math.max(24, Math.abs(x2 - x1) / 2)
          d = `M ${x1} ${y1} C ${x1 + sign * dx} ${y1}, ${x2 - sign * dx} ${y2}, ${x2} ${y2}`
        }
        next.push({ id: e.id, d, kind: e.kind })
      }
      setPaths(next)
    }
    recalc()
    const observer = new ResizeObserver(recalc)
    observer.observe(container)
    window.addEventListener('resize', recalc)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', recalc)
    }
  }, [allEdges])

  if (!novel) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white py-16 text-center">
        {loadingNovel ? <Spin /> : <Empty description="书籍加载失败" />}
      </div>
    )
  }

  const chapters = sortedChapters(novel)
  const recommendedId = recommendedPlusId(novel)

  // 某文段是否正在生成（含后台生成）：非 generate 看 targetId，generate 看章节+产出类型
  const isArtifactGenerating = (artifact: NovelArtifact) =>
    !!streaming &&
    (streaming.targetId === artifact.id ||
      (streaming.op === 'generate' &&
        streaming.chapterId === (artifact.chapterId ?? null) &&
        (streaming.target === artifact.type ||
          // 摘要生成中也算在正文节点上（摘要不是画布节点）
          (artifact.type === 'content' && streaming.target === 'summary'))))

  const streamText = streaming?.text ?? ''

  return (
    <div className="pb-8">
      {chapters.length === 0 && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          还没有章节，点击下方「生成下一章大纲」开始（先在左侧上传参考文 /
          维护设定可获得更好的效果）
        </div>
      )}
      <div ref={containerRef} className="relative">
        {/* 连线层（卡片之下，只露在间隙中） */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full text-slate-300">
          {paths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              fill="none"
              stroke={p.kind === 'input' ? 'var(--app-accent)' : 'currentColor'}
              strokeWidth={p.kind === 'input' ? 2 : 1.5}
              strokeDasharray={p.kind === 'input' ? '5 4' : undefined}
            />
          ))}
        </svg>

        <div className="relative grid grid-cols-2 gap-x-8 gap-y-6 md:gap-x-16">
          {chapters.map((chapter) => {
            const outline = findChapterArtifact(novel, chapter.id, 'outline')
            const content = findChapterArtifact(novel, chapter.id, 'content')
            const outlinePlaceholderId = outlinePlusId(chapter.id)
            const contentPlusNodeId = contentPlusId(chapter.id)
            return (
              <Fragment key={chapter.id}>
                {/* 大纲列 */}
                <div className="min-w-0">
                  {outline ? (
                    <NodeCard
                      novel={novel}
                      artifact={outline}
                      generating={isArtifactGenerating(outline)}
                      streamText={streamText}
                      active={nodeModalId === outline.id}
                      highlighted={
                        !!nodeModalId &&
                        inputEdges.some((e) => e.from === outline.id)
                      }
                      onClick={() => openNodeModal(outline.id)}
                    />
                  ) : (
                    <PlusNode
                      nodeId={outlinePlaceholderId}
                      label="生成大纲"
                      hint="下一步：补齐本章大纲"
                      highlighted={recommendedId === outlinePlaceholderId}
                      generating={
                        streaming?.op === 'generate' &&
                        streaming.target === 'outline' &&
                        streaming.chapterId === chapter.id
                      }
                      streamText={streamText}
                      disabled={!!streaming}
                      onClick={() =>
                        openGenerateModal({
                          outputType: 'outline',
                          chapterId: chapter.id,
                        })
                      }
                    />
                  )}
                </div>
                {/* 正文列 */}
                <div className="min-w-0">
                  {content ? (
                    <NodeCard
                      novel={novel}
                      artifact={content}
                      generating={isArtifactGenerating(content)}
                      streamText={streamText}
                      active={nodeModalId === content.id}
                      highlighted={
                        !!nodeModalId &&
                        inputEdges.some((e) => e.from === content.id)
                      }
                      onClick={() => openNodeModal(content.id)}
                    />
                  ) : outline ? (
                    <PlusNode
                      nodeId={contentPlusNodeId}
                      label="生成正文"
                      hint="下一步：按大纲写正文"
                      highlighted={recommendedId === contentPlusNodeId}
                      generating={
                        streaming?.op === 'generate' &&
                        (streaming.target === 'content' ||
                          streaming.target === 'summary') &&
                        streaming.chapterId === chapter.id
                      }
                      streamText={streamText}
                      disabled={!!streaming}
                      onClick={() =>
                        openGenerateModal({
                          outputType: 'content',
                          chapterId: chapter.id,
                        })
                      }
                    />
                  ) : null}
                </div>
              </Fragment>
            )
          })}

          {/* 大纲列末尾加号（生成下一章大纲，章节由 service 在生成开始时创建） */}
          <div className="min-w-0">
            <PlusNode
              nodeId={OUTLINE_PLUS_ID}
              label="生成下一章大纲"
              hint={chapters.length === 0 ? '从这里开始' : '下一步：新章大纲'}
              highlighted={recommendedId === OUTLINE_PLUS_ID}
              generating={
                streaming?.op === 'generate' &&
                streaming.target === 'outline' &&
                streaming.chapterId === null
              }
              streamText={streamText}
              disabled={!!streaming}
              onClick={() => openGenerateModal({ outputType: 'outline' })}
            />
          </div>
          <div />
        </div>
      </div>
    </div>
  )
}
