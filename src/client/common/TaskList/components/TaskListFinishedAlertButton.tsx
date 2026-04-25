import { Switch } from 'antd'
import { BellOutlined } from '@ant-design/icons'
import { useLocalStorageState } from 'ahooks'
import { useEffect, useRef } from 'react'
import type { Task } from '../../../../server/common/task-manager'

interface TaskListFinishedAlertButtonProps {
  tasks: Task[]
}

export function TaskListFinishedAlertButton({
  tasks
}: TaskListFinishedAlertButtonProps) {
  const [notifyEnabled, setNotifyEnabled] = useLocalStorageState(
    'taskCompletionNotification',
    { defaultValue: false }
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
    if (prevTasks.length > 0) {
      const completedTasks = tasks.filter((t) => {
        const prev = prevTasks.find((pt) => pt.id === t.id)
        return t.status === 'completed' && prev && prev.status !== 'completed'
      })

      if (completedTasks.length > 0 && Notification.permission === 'granted') {
        const title =
          completedTasks.length === 1
            ? `任务完成: ${completedTasks[0].rawTemplate?.title || '未命名任务'}`
            : `有 ${completedTasks.length} 个任务已完成`
        new Notification(title, {
          body: '请在任务列表查看详情',
          icon: completedTasks[0].outputUrl || undefined
        })
      }
    }

    prevTasksRef.current = tasks
  }, [tasks, notifyEnabled])

  return (
    <div className="flex items-center gap-2">
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
