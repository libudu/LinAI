import { Popover } from 'antd'
import type { ContextSnapshot, Novel } from '../types'
import { formatTokens } from '../types'

// 上下文快照标签条：`设定×4 · 摘要×6 · 全文×3 · ≈18.2k tokens`，点击展开只读快照详情
export const ContextTagBar = ({
  snapshot,
  novel,
}: {
  snapshot: ContextSnapshot | null
  novel: Novel
}) => {
  if (!snapshot) return null

  const chapterLabel = (id: string) => {
    const ch = novel.chapters.find((c) => c.id === id)
    return ch ? `第${ch.index}章` : '（已删除章节）'
  }
  const refNames = snapshot.refIds.map(
    (id) => novel.refs.find((r) => r.id === id)?.title ?? '（已删除）',
  )
  const settingNames = snapshot.settingIds.map(
    (id) => novel.settings.find((s) => s.id === id)?.title ?? '（已删除）',
  )
  const fullChapters = snapshot.fullChapterIds.map(chapterLabel)
  const summaryChapters = snapshot.summaryChapterIds.map(chapterLabel)

  const detail = (
    <div className="max-w-80 space-y-1 text-xs">
      <div>
        <span className="text-slate-400">核心设定：</span>
        {settingNames.length ? settingNames.join('、') : '未携带'}
      </div>
      <div>
        <span className="text-slate-400">参考文：</span>
        {refNames.length ? refNames.join('、') : '未携带'}
      </div>
      <div>
        <span className="text-slate-400">全文章节：</span>
        {fullChapters.length ? fullChapters.join('、') : '无'}
      </div>
      <div>
        <span className="text-slate-400">摘要章节：</span>
        {summaryChapters.length ? summaryChapters.join('、') : '无'}
      </div>
      <div>
        <span className="text-slate-400">生成时估算：</span>≈
        {formatTokens(snapshot.estimatedTokens)} tokens
      </div>
    </div>
  )

  return (
    <Popover content={detail} title="生成时的上下文快照" placement="bottomLeft">
      <span
        className="cursor-pointer text-xs text-slate-400 hover:text-[#EC883A]"
        onClick={(e) => e.stopPropagation()}
      >
        设定×{snapshot.settingIds.length} · 摘要×
        {snapshot.summaryChapterIds.length} · 全文×
        {snapshot.fullChapterIds.length} · 参考×{snapshot.refIds.length} · ≈
        {formatTokens(snapshot.estimatedTokens)} tokens
      </span>
    </Popover>
  )
}
