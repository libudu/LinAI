import type { NodeProps } from '@ant-design/pro-flow'
import { Handle, Position } from '@ant-design/pro-flow'
import { Tooltip } from 'antd'
import { memo } from 'react'
import type { InfoNodeData } from '../types'
export const InfoNode = memo(function InfoNode({
  data,
}: NodeProps<InfoNodeData>) {
  const promptPreview =
    data.prompt.length > 80 ? data.prompt.slice(0, 80) + '…' : data.prompt

  return (
    <div className="w-56 rounded-xl border-2 border-amber-200 bg-amber-50/90 p-3 shadow-sm backdrop-blur transition-shadow hover:shadow-md">
      <Handle
        type="target"
        position={Position.Left}
        className="!border-2 !border-amber-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!border-2 !border-amber-400"
      />

      {/* header */}
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-sm">📄</span>
        <span className="truncate text-xs font-semibold text-slate-700">
          {data.title || '提示词信息'}
        </span>
      </div>

      {/* prompt */}
      <Tooltip title={data.prompt}>
        <div className="mb-1 line-clamp-3 text-xs text-slate-600">
          {promptPreview}
        </div>
      </Tooltip>

      {/* aspect ratio tag */}
      {data.aspectRatio && (
        <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
          {data.aspectRatio}
        </span>
      )}
    </div>
  )
})
