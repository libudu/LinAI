import { Popover } from 'antd'
import type { Novel, NovelText } from '../types'
import { chapterIndex, formatTokens } from '../types'

// 生成溯源标签条：展示该文本生成时引用的 sourceIds，
// 引用的文本已删除（查不到）时显示删除线 + （已删除）
export const ContextTagBar = ({
  text,
  novel,
}: {
  text: NovelText | undefined
  novel: Novel
}) => {
  if (!text || text.sourceIds.length === 0) return null

  // 解析单个来源 id 的展示名；查不到返回 null（已删除）
  const resolveLabel = (id: string): string | null => {
    const source = novel.texts.find((t) => t.id === id)
    if (!source) return null
    switch (source.type) {
      case 'ref':
        return `参考《${source.title}》`
      case 'setting':
        return `设定《${source.title}》`
      case 'outline':
        return `第${chapterIndex(novel, source.chapterId!)}章大纲`
      case 'content':
        return `第${chapterIndex(novel, source.chapterId!)}章正文`
      case 'summary':
        return `第${chapterIndex(novel, source.chapterId!)}章摘要`
    }
  }

  const labels = text.sourceIds.map((id) => ({ id, label: resolveLabel(id) }))
  const deletedCount = labels.filter((l) => l.label === null).length

  const detail = (
    <div className="max-w-80 space-y-1 text-xs">
      {labels.map(({ id, label }) =>
        label === null ? (
          <div key={id} className="text-slate-400 line-through">
            （已删除）
          </div>
        ) : (
          <div key={id}>{label}</div>
        ),
      )}
      {text.estimatedTokens !== undefined && (
        <div className="border-t border-slate-100 pt-1">
          <span className="text-slate-400">生成时估算：</span>≈
          {formatTokens(text.estimatedTokens)} tokens
        </div>
      )}
    </div>
  )

  return (
    <Popover content={detail} title="生成时引用的文本" placement="bottomLeft">
      <span
        className="cursor-pointer text-xs text-slate-400 hover:text-[#EC883A]"
        onClick={(e) => e.stopPropagation()}
      >
        引用×{text.sourceIds.length}
        {deletedCount > 0 && `（${deletedCount} 已删除）`}
        {text.estimatedTokens !== undefined &&
          ` · ≈${formatTokens(text.estimatedTokens)} tokens`}
      </span>
    </Popover>
  )
}
