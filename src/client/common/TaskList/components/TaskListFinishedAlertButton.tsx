import { BellOutlined } from '@ant-design/icons'
import { useLocalStorageState } from 'ahooks'
import { Switch } from 'antd'
import { useEffect, useRef } from 'react'
import type { Task } from '../../../../server/common/task-manager'

interface TaskListFinishedAlertButtonProps {
  tasks: Task[]
}

export function TaskListFinishedAlertButton({
  tasks,
}: TaskListFinishedAlertButtonProps) {
  const [notifyEnabled, setNotifyEnabled] = useLocalStorageState(
    'taskCompletionNotification',
    { defaultValue: false },
  )

  const handleNotifyChange = (checked: boolean) => {
    if (checked && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    setNotifyEnabled(checked)
  }

  // 通知逻辑
  const prevTasksRef = useRef<Task[]>([])
  useEffect(() => {
    if (!notifyEnabled) {
      prevTasksRef.current = tasks
      return
    }

    const prevTasks = prevTasksRef.current
    if (prevTasks.length > 0 && tasks.length > 0) {
      const isAllDone = tasks.every(
        (t) => t.status === 'completed' || t.status === 'failed',
      )

      const hasNewlyFinishedTask = tasks.some((t) => {
        const prev = prevTasks.find((pt) => pt.id === t.id)
        return (
          (t.status === 'completed' || t.status === 'failed') &&
          prev &&
          (prev.status === 'pending' || prev.status === 'running')
        )
      })

      if (
        isAllDone &&
        hasNewlyFinishedTask &&
        Notification.permission === 'granted'
      ) {
        new Notification('LinAI 所有任务已完成', {
          body: '请在任务列表查看详情',
        })
      }
    }

    prevTasksRef.current = tasks
  }, [tasks, notifyEnabled])

  return (
    <div className="hidden items-center gap-2 sm:flex">
      <span className="text-base text-gray-600">
        <BellOutlined /> 完成提醒
      </span>
      <Switch
        checked={notifyEnabled}
        onChange={handleNotifyChange}
        size="small"
      />
    </div>
  )
}
