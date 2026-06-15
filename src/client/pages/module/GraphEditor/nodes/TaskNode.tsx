import type { NodeProps } from '@ant-design/pro-flow'
import { Handle, Position } from '@ant-design/pro-flow'
import { Image, Spin, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { memo } from 'react'
import type { TaskNodeData } from '../types'

export const TaskNode = memo(function TaskNode({
  data,
}: NodeProps<TaskNodeData>) {
  const hasOrder =
    typeof data.selectionOrder === 'number' && data.selectionOrder > 0
  return (
    <div
      className={`relative w-52 rounded-xl border-2 bg-white p-2 shadow-sm transition-shadow hover:shadow-md ${
        hasOrder ? 'border-blue-500 ring-2 ring-blue-300' : 'border-violet-200'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!border-2 !border-violet-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!border-2 !border-violet-400"
      />

      {hasOrder && (
        <div className="absolute -top-2 -right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white shadow-md">
          {data.selectionOrder}
        </div>
      )}

      {/* status bar */}
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">
          {data.title || '生成任务'}
        </span>
        <StatusTag status={data.status} />
      </div>

      {/* preview */}
      <div className="mb-1 flex h-[90px] items-center justify-center overflow-hidden rounded-lg bg-slate-50">
        {data.status === 'running' || data.status === 'pending' ? (
          <div className="flex flex-col items-center gap-1">
            <Spin size="small" />
            <span className="text-[10px] text-slate-400">
              {data.status === 'running' ? '运行中…' : '排队中…'}
            </span>
          </div>
        ) : data.status === 'failed' ? (
          <span className="text-xs text-red-500">
            {data.error || '生成失败'}
          </span>
        ) : data.outputUrls.length > 0 ? (
          <Image
            src={data.outputUrls[0]}
            alt=""
            className="!rounded-md"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            preview={{ mask: null }}
          />
        ) : (
          <span className="text-xs text-slate-400">无输出</span>
        )}
      </div>

      {/* footer */}
      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>{dayjs(data.createdAt).format('MM/DD HH:mm')}</span>
        {data.prompt && (
          <Tooltip title={data.prompt}>
            <span className="max-w-[120px] truncate text-[10px] text-slate-400">
              {data.prompt}
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  )
})

function StatusTag({ status }: { status: TaskNodeData['status'] }) {
  const map: Record<
    TaskNodeData['status'],
    { label: string; className: string }
  > = {
    pending: { label: '等待', className: 'bg-slate-100 text-slate-500' },
    running: { label: '运行', className: 'bg-blue-100 text-blue-600' },
    completed: { label: '完成', className: 'bg-green-100 text-green-600' },
    failed: { label: '失败', className: 'bg-red-100 text-red-600' },
  }
  const s = map[status]
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${s.className}`}
    >
      {s.label}
    </span>
  )
}
