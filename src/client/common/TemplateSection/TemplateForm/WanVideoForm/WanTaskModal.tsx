import { message, Modal, Pagination, Spin } from 'antd'
import { hc } from 'hono/client'
import { useEffect, useState } from 'react'
import type { AppType } from '../../../../../server'
import type { TaskData } from '../../../../../server/module/wan-downloader/types'
import { WanTaskCard } from './WanTaskCard'

const client = hc<AppType>('/')

interface WanTaskModalProps {
  open: boolean
  onCancel: () => void
  onSelect: (task: TaskData) => void
}

export function WanTaskModal({ open, onCancel, onSelect }: WanTaskModalProps) {
  const [loading, setLoading] = useState(false)
  const [tasks, setTasks] = useState<TaskData[]>([])
  const [page, setPage] = useState(1)
  const pageSize = 20

  useEffect(() => {
    if (open) {
      fetchTasks(pageSize)
    }
  }, [open])

  const fetchTasks = async (size: number) => {
    setLoading(true)
    try {
      const res = await client.api.wan['task-list'].$get({
        query: { pageSize: size.toString() },
      })
      const data = await res.json()
      if (data.success && 'data' in data && data.data) {
        setTasks(data.data)
      } else {
        message.error(
          (data as any).errorMsg || (data as any).error || '获取任务列表失败',
        )
      }
    } catch (e) {
      message.error('请求失败')
    } finally {
      setLoading(false)
    }
  }

  const paginatedTasks = tasks.slice((page - 1) * 10, page * 10)
  const total = tasks.length

  return (
    <Modal
      title="Wan 官网任务列表"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={800}
      destroyOnClose
    >
      <div className="min-h-[400px]">
        {loading ? (
          <div className="flex h-[400px] items-center justify-center">
            <Spin size="large" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              {paginatedTasks.map((task) => (
                <WanTaskCard
                  key={task.taskId}
                  task={task}
                  onSelect={() => onSelect(task)}
                />
              ))}
            </div>
            {tasks.length === 0 && (
              <div className="py-10 text-center text-slate-400">
                暂无任务数据
              </div>
            )}
            {tasks.length > 0 && (
              <div className="flex justify-end pt-4">
                <Pagination
                  current={page}
                  pageSize={10}
                  total={total}
                  onChange={(p) => setPage(p)}
                  showSizeChanger={false}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
