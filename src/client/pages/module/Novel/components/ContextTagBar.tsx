import { Popover } from 'antd'
import type { Novel, NovelArtifact } from '../types'
import { chapterIndex, formatTokens } from '../types'

// 生成溯源标签条：展示该文段生成时引用的 inputs，
// 引用的文段已删除（查不到）时显示删除线 + （已删除）
export const ContextTagBar = ({
  artifact,
  novel,
}: {
  artifact: NovelArtifact | undefined
  novel: Novel
}) => {
  if (!artifact || artifact.inputs.length === 0) return null

  // 解析单个来源 id 的展示名；查不到返回 null（已删除）
  const resolveLabel = (id: string): string | null => {
    const source = novel.artifacts.find((t) => t.id === id)
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

  const labels = artifact.inputs.map((id) => ({ id, label: resolveLabel(id) }))
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
      {artifact.estimatedTokens !== undefined && (
        <div className="border-t border-slate-100 pt-1">
          <span className="text-slate-400">生成时估算：</span>≈
          {formatTokens(artifact.estimatedTokens)} tokens
        </div>
      )}
    </div>
  )

  return (
    <Popover content={detail} title="生成时引用的文段" placement="bottomLeft">
      <span
        className="app-accent-hover cursor-pointer text-xs text-slate-400"
        onClick={(e) => e.stopPropagation()}
      >
        引用×{artifact.inputs.length}
        {deletedCount > 0 && `（${deletedCount} 已删除）`}
        {artifact.estimatedTokens !== undefined &&
          ` · ≈${formatTokens(artifact.estimatedTokens)} tokens`}
      </span>
    </Popover>
  )
}
