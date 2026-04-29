import { ClockCircleOutlined } from '@ant-design/icons'
import { Tag, Tooltip } from 'antd'
import type { Task } from '../../../../server/common/task-manager'
import {
  GPT_IMAGE_RMB_RATIO,
  MODEL_GROUP_RATIO,
} from '../../../hooks/useGPTImageQuota'

interface TaskItemTagsProps {
  task: Task
  downloadedIds: string[]
}

export function TaskItemTags({ task, downloadedIds }: TaskItemTagsProps) {
  const renderCost = (record: Task) => {
    if (record.gptTokenUsage) {
      const inputTokens = record.gptTokenUsage.input_tokens || 0
      const outputTokens = record.gptTokenUsage.output_tokens || 0
      const inputCost =
        (((5 / 1000000) * inputTokens) / GPT_IMAGE_RMB_RATIO) *
        MODEL_GROUP_RATIO
      const outputCost =
        (((30 / 1000000) * outputTokens) / GPT_IMAGE_RMB_RATIO) *
        MODEL_GROUP_RATIO
      const totalCost = inputCost + outputCost
      const cost2str = (cost: number) =>
        '￥' + (Math.ceil(cost * 100) / 100).toFixed(2)
      const tooltipContent = (
        <div>
          <div>输入 tokens: {inputTokens}</div>
          <div>输入预估费用: {cost2str(inputCost)}</div>
          <div>输出 tokens: {outputTokens}</div>
          <div>输出预估费用: {cost2str(outputCost)}</div>
          <div>以上仅根据token消耗粗略计算，以实际余额变化为准</div>
          <div>实际费用根据分组可用性不同会有 1 ~ 3 倍波动</div>
        </div>
      )

      return (
        <Tooltip title={tooltipContent}>
          <Tag color="gold" style={{ cursor: 'help' }}>
            约{cost2str(totalCost)}
          </Tag>
        </Tooltip>
      )
    }
    return null
  }

  return (
    <div className="mb-2 flex flex-wrap gap-1">
      <Tag color="purple">
        {task.rawTemplate?.usageType === 'image' ? '图片' : '视频'}
      </Tag>
      {task.rawTemplate?.aspectRatio && (
        <Tag color="blue">{task.rawTemplate.aspectRatio}</Tag>
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
          {task.quality === 'high' ? 'High' : 'Medium'}
        </Tag>
      )}
      {downloadedIds?.includes(task.id) ? (
        <Tag color="cyan">已下载</Tag>
      ) : (
        <Tag color="geekblue">未下载</Tag>
      )}
      {renderCost(task)}
      {task.duration && (
        <Tag color="lime">
          <ClockCircleOutlined className="mr-1" />
          {(task.duration / 1000).toFixed(1)}s
        </Tag>
      )}
    </div>
  )
}
