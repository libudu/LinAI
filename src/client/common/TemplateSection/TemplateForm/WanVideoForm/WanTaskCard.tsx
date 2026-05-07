import { Button } from 'antd'
import type { TaskData } from '../../../../../server/module/wan-downloader/types'

interface WanTaskCardProps {
  task: TaskData
  onSelect: () => void
}

export function WanTaskCard({ task, onSelect }: WanTaskCardProps) {
  let coverUrl = task.taskInput.baseImage
  if (!coverUrl && task.taskResult && task.taskResult.length > 0) {
    coverUrl = task.taskResult[0].videoFirstFrameUrl || task.taskResult[0].url
  }

  const isSuccess = task.status === 2
  const isFailed = task.status !== 2 && task.status !== -1

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-emerald-300 hover:shadow-sm">
      <div className="flex gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt="cover"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
              无预览
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col justify-between overflow-hidden">
          <div className="line-clamp-2 text-sm text-slate-700" title={task.taskInput.prompt}>
            {task.taskInput.prompt || '无提示词'}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-slate-400">
              {new Date(task.gmtCreateTimeStamp).toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs ${isSuccess ? 'text-emerald-500' : isFailed ? 'text-red-500' : 'text-amber-500'}`}>
                {isSuccess ? '已完成' : isFailed ? '失败' : '处理中'}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-2 flex justify-end border-t border-slate-100 pt-3">
        <Button size="small" type="primary" onClick={onSelect}>
          选择此任务
        </Button>
      </div>
    </div>
  )
}
