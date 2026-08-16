// 画布派生计算：连线、加号占位节点 id、推荐高亮。
// 全部从现有字段（chapterId / chapters 顺序 / inputs）派生，不落盘
import type { Novel } from '../types'
import { findChapterArtifact, sortedChapters } from '../types'

// 虚拟节点的 DOM 锚点 id（data-node-id）
export const OUTLINE_PLUS_ID = 'outline-plus' // 大纲列末尾加号（生成下一章大纲）
export const outlinePlusId = (chapterId: string) => `outline-plus:${chapterId}` // 某章缺大纲的占位
export const contentPlusId = (chapterId: string) => `content-plus:${chapterId}` // 某章缺正文的加号

export interface CanvasEdge {
  id: string
  from: string
  to: string
  /** h：大纲→正文（横向）；v：大纲链（纵向）；input：选中节点的来源高亮（虚线） */
  kind: 'h' | 'v' | 'input'
}

// 派生连线：
// - 大纲 → 同章正文（无正文则 → 该行的正文加号）
// - 大纲链纵向：大纲 → 下一章大纲（缺大纲章用占位加号入链），链尾 → 大纲列末尾加号
export const deriveEdges = (novel: Novel): CanvasEdge[] => {
  const edges: CanvasEdge[] = []
  const chapters = sortedChapters(novel)

  // 大纲链节点 id（缺大纲的章用占位加号）
  const chainIds = chapters.map((c) => {
    const outline = findChapterArtifact(novel, c.id, 'outline')
    return outline?.id ?? outlinePlusId(c.id)
  })

  chapters.forEach((c, i) => {
    const outline = findChapterArtifact(novel, c.id, 'outline')
    if (outline) {
      const content = findChapterArtifact(novel, c.id, 'content')
      // 无正文的章该行渲染正文加号，连线指向加号
      const to = content?.id ?? contentPlusId(c.id)
      edges.push({ id: `h:${outline.id}`, from: outline.id, to, kind: 'h' })
    }
    const next = chainIds[i + 1] ?? OUTLINE_PLUS_ID
    edges.push({
      id: `v:${chainIds[i]}`,
      from: chainIds[i],
      to: next,
      kind: 'v',
    })
  })

  // 一本书都没有时，空画布只渲染大纲列末尾加号，无连线
  return edges
}

// 推荐高亮的加号节点 id（引导「先大纲后正文」，不强制）：
// 无章节 / 最新章缺大纲 → 大纲加号（或缺大纲占位）；最新章有大纲缺正文 → 该章正文加号；
// 全部齐备 → 大纲列末尾加号（下一步是新章大纲）
export const recommendedPlusId = (novel: Novel): string => {
  const chapters = sortedChapters(novel)
  const last = chapters[chapters.length - 1]
  if (!last) return OUTLINE_PLUS_ID
  if (!findChapterArtifact(novel, last.id, 'outline'))
    return outlinePlusId(last.id)
  if (!findChapterArtifact(novel, last.id, 'content'))
    return contentPlusId(last.id)
  return OUTLINE_PLUS_ID
}
