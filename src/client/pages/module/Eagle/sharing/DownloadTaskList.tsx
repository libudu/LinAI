import { Alert, Empty, Pagination, Progress, theme } from 'antd'
import { useState } from 'react'
import type { SharingStatus } from './api'

type Task = Pick<
  SharingStatus['downloads'][number],
  'id' | 'folder' | 'completed' | 'remaining' | 'percent' | 'state' | 'error'
>

const states = {
  queued: '等待下载',
  running: '下载中',
  completed: '已完成',
  error: '下载失败',
}

export function DownloadTaskList({ tasks }: { tasks: Task[] }) {
  const { token } = theme.useToken()
  const [page, setPage] = useState(1)
  const pageSize = 5
  const current = Math.min(
    page,
    Math.max(1, Math.ceil(tasks.length / pageSize)),
  )
  // 正在下载的任务优先，其次为等待中的任务和最近结束的任务。
  const sorted = [...tasks].reverse().sort((a, b) => {
    const order = { running: 0, queued: 1, error: 2, completed: 3 }
    return order[a.state] - order[b.state]
  })
  if (!tasks.length)
    return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无下载任务" />
    )
  return (
    <div>
      <div className="divide-y divide-slate-200">
        {sorted
          .slice((current - 1) * pageSize, current * pageSize)
          .map((task) => (
            <div key={task.id} className="space-y-1 py-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-baseline gap-1">
                  <span className="min-w-0 truncate" title={task.folder}>
                    {task.folder}
                  </span>
                  <span
                    className="shrink-0 text-xs"
                    style={{ color: token.colorTextTertiary }}
                  >
                    （已完成 {task.completed} · 剩余 {task.remaining}）
                  </span>
                </div>
                <span className="shrink-0 text-slate-500">
                  {states[task.state]}
                </span>
              </div>
              <Progress
                percent={task.percent}
                status={
                  task.state === 'error'
                    ? 'exception'
                    : task.state === 'running'
                      ? 'active'
                      : 'normal'
                }
                strokeColor={
                  task.state === 'error' ? token.colorError : token.colorPrimary
                }
                strokeWidth={4}
                format={(percent) => `${percent}%`}
              />
              {task.error && <Alert type="error" showIcon title={task.error} />}
            </div>
          ))}
      </div>
      {tasks.length > pageSize && (
        <Pagination
          className="mt-3"
          size="small"
          current={current}
          pageSize={pageSize}
          total={tasks.length}
          showSizeChanger={false}
          onChange={setPage}
        />
      )}
    </div>
  )
}
