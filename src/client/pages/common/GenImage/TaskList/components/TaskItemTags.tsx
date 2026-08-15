import { usePlatform } from '@/client/hooks/usePlatform'
import type { Task } from '@/server/common/task'
import { ClockCircleOutlined } from '@ant-design/icons'
import { Tag, Tooltip } from 'antd'

interface TaskItemTagsProps {
  task: Task
  downloadedIds: string[]
}

export function TaskItemTags({ task, downloadedIds }: TaskItemTagsProps) {
  const { isDesktop } = usePlatform()

  return (
    <div className="mb-2 flex flex-wrap gap-1">
      {task.inputSnapshot?.aspectRatio && (
        <Tag color="blue">{task.inputSnapshot.aspectRatio}</Tag>
      )}
      {task.size && (
        <Tooltip
          title="该尺寸仅为输入时设置的尺寸，实际会受到模型最大像素限制、比例调整和分组分辨率可用性，以实际图片比例为准"
          className="cursor-pointer"
        >
          <Tag color="magenta">{task.size}</Tag>
        </Tooltip>
      )}
      {task.quality && (
        <Tag color={task.quality === 'high' ? 'red' : 'volcano'}>
          {task.quality === 'high' ? 'High' : 'Med'}
        </Tag>
      )}
      {downloadedIds?.includes(task.id) ? (
        <Tag color="cyan">已下载</Tag>
      ) : (
        <Tag color="geekblue">未下载</Tag>
      )}
      {isDesktop && task.duration && (
        <Tag color="lime">
          <ClockCircleOutlined className="mr-1" />
          {(task.duration / 1000).toFixed(1)}s
        </Tag>
      )}
    </div>
  )
}
