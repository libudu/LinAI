import { BellOutlined } from '@ant-design/icons'
import { useLocalStorageState } from 'ahooks'
import { Switch } from 'antd'
import { useEffect, useRef } from 'react'
import type { ImageTaskSummary } from '../useTasks'

interface TaskListFinishedAlertButtonProps {
  summary: ImageTaskSummary | null
}

export function TaskListFinishedAlertButton({
  summary,
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

  // 摘要覆盖所有页；首次加载与批量删除不会误报完成。
  const previousRef = useRef<ImageTaskSummary | null>(null)
  useEffect(() => {
    if (!summary) return
    const previous = previousRef.current
    previousRef.current = summary
    if (
      notifyEnabled &&
      previous &&
      summary.active === 0 &&
      summary.finishedAt > previous.finishedAt &&
      Notification.permission === 'granted'
    ) {
      new Notification('LinAI 所有任务已完成', { body: '请在任务列表查看详情' })
    }
  }, [summary, notifyEnabled])

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
