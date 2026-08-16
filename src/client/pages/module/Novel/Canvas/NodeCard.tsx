import { LoadingOutlined, PlusOutlined } from '@ant-design/icons'
import { Tag } from 'antd'
import { ARTIFACT_TYPE_DEFS, artifactNodeTitle } from '../artifactTypes'
import type { Novel, NovelArtifact } from '../types'

// 画布节点卡片：标题 + 类型 tag + 字数 + 版本号 + 内容预览几行；生成中态在卡片上体现
export const NodeCard = ({
  novel,
  artifact,
  generating,
  streamText,
  highlighted,
  active,
  onClick,
}: {
  novel: Novel
  artifact: NovelArtifact
  /** 该节点正在流式生成（含后台生成：模态框关闭后仍显示） */
  generating?: boolean
  /** 生成中的流式文本（用于显示已生成字数与末尾预览） */
  streamText?: string
  /** 是当前选中节点的 inputs 来源（高亮描边） */
  highlighted?: boolean
  /** 当前选中（节点模态框打开中） */
  active?: boolean
  onClick: () => void
}) => (
  <div
    data-node-id={artifact.id}
    className={`cursor-pointer rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md ${
      active || highlighted || generating
        ? 'app-accent-outline'
        : 'border-slate-200'
    }`}
    onClick={onClick}
  >
    <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
      <Tag color={ARTIFACT_TYPE_DEFS[artifact.type].tagColor} className="mr-0">
        {ARTIFACT_TYPE_DEFS[artifact.type].label}
      </Tag>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
        {artifactNodeTitle(novel, artifact)}
      </span>
      {generating ? (
        <span className="app-accent-text shrink-0 text-xs">
          <LoadingOutlined className="mr-1" />
          生成中
          {streamText ? `（${streamText.length.toLocaleString()} 字）` : '…'}
        </span>
      ) : (
        <span className="shrink-0 text-xs text-slate-400">
          {artifact.content.length.toLocaleString()} 字 · v{artifact.version}
        </span>
      )}
    </div>
    <div className="line-clamp-3 px-3 py-2 text-xs leading-5 break-words whitespace-pre-wrap text-slate-500">
      {generating
        ? streamText
          ? streamText.slice(-300)
          : '等待响应…'
        : artifact.content || '（空）'}
    </div>
  </div>
)

// 加号占位节点（虚拟，不落盘）：高亮推荐时描边加强调色
export const PlusNode = ({
  nodeId,
  label,
  hint,
  highlighted,
  generating,
  streamText,
  disabled,
  onClick,
}: {
  nodeId: string
  label: string
  /** 高亮推荐时的引导语 */
  hint?: string
  highlighted?: boolean
  generating?: boolean
  streamText?: string
  disabled?: boolean
  onClick: () => void
}) => (
  <div
    data-node-id={nodeId}
    className={`rounded-lg border border-dashed px-3 py-3 text-center transition-colors ${
      generating
        ? 'app-accent-outline bg-white'
        : disabled
          ? 'cursor-not-allowed border-slate-200 bg-white/60 opacity-60'
          : highlighted
            ? 'app-accent-outline app-accent-surface cursor-pointer'
            : 'cursor-pointer border-slate-300 bg-white/60 hover:border-slate-400'
    }`}
    onClick={disabled || generating ? undefined : onClick}
  >
    {generating ? (
      <div className="text-left">
        <div className="app-accent-text mb-1 flex items-center justify-between text-xs">
          <span>
            <LoadingOutlined className="mr-1" />
            {label}中
            {streamText ? `（${streamText.length.toLocaleString()} 字）` : '…'}
          </span>
        </div>
        <div className="line-clamp-3 text-xs leading-5 break-words whitespace-pre-wrap text-slate-500">
          {streamText ? streamText.slice(-300) : '等待响应…'}
        </div>
      </div>
    ) : (
      <>
        <div
          className={`text-sm ${highlighted ? 'app-accent-text font-medium' : 'text-slate-400'}`}
        >
          <PlusOutlined className="mr-1" />
          {label}
        </div>
        {highlighted && hint && (
          <div className="app-accent-text mt-0.5 text-xs">{hint}</div>
        )}
      </>
    )}
  </div>
)
