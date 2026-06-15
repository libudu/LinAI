import type { NodeProps } from '@ant-design/pro-flow'
import { Handle, Position } from '@ant-design/pro-flow'
import { memo } from 'react'
import type { ImageNodeData } from '../types'
export const ImageNode = memo(function ImageNode({
  data,
}: NodeProps<ImageNodeData>) {
  const hasOrder =
    typeof data.selectionOrder === 'number' && data.selectionOrder > 0

  return (
    <div
      className={`group relative rounded-lg border-2 bg-white p-1 shadow-sm transition-shadow hover:shadow-md ${
        hasOrder ? 'border-blue-500 ring-2 ring-blue-300' : 'border-slate-200'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!border-2 !border-blue-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!border-2 !border-blue-400"
      />

      <div className="relative" style={{ width: 120, height: 120 }}>
        <img
          src={data.imageUrl}
          alt=""
          className="h-full w-full rounded-md object-cover"
          loading="lazy"
          draggable={false}
        />

        {hasOrder && (
          <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white shadow-md">
            {data.selectionOrder}
          </div>
        )}
      </div>

      <div className="mt-1 px-0.5 text-[10px] text-slate-400">
        {data.sourceType === 'gallery' && '📷 图片'}
        {data.sourceType === 'template' && '📋 模板'}
        {data.sourceType === 'task' && '📝 任务'}
      </div>
    </div>
  )
})
