import {
  Card,
  Tag,
  Typography,
  Button,
  Image,
  Tooltip,
  List,
  message
} from 'antd'
import {
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  RedoOutlined
} from '@ant-design/icons'
import { useState } from 'react'
import { useLocalStorageState } from 'ahooks'
import { hc } from 'hono/client'
import type { AppType } from '../../../server'
import type { Task } from '../../../server/common/task-manager'
import { useTasks } from '../../hooks/useTasks'
import {
  GPT_IMAGE_RMB_RATIO,
  useGPTImageQuota
} from '../../hooks/useGPTImageQuota'
import { DeleteTaskButton } from './DeleteButton'
import styles from './index.module.scss'
import { DownloadButton } from './DownloadButton'
import { TRIAL_TEMPLATE_TITLE } from '../../../server/common/template-manager/enum'
import { GPT_IMAGE_SOURCE_MODEL } from '../../../server/common/gpt-image/enum'

const client = hc<AppType>('/')

export function TaskList() {
  const { data: tasks = [], loading, refresh: fetchTasks } = useTasks()
  const { quota } = useGPTImageQuota()
  const [downloadedIds, setDownloadedIds] = useLocalStorageState<string[]>(
    'downloadedTaskIds',
    { defaultValue: [] }
  )
  const [retryingIds, setRetryingIds] = useState<string[]>([])

  const handleRetry = async (task: Task) => {
    setRetryingIds((prev) => [...prev, task.id])
    try {
      const res = await client.api.gptImage.generate.$post({
        json: {
          templateId: task.rawTemplate?.id || '',
          size: '2k'
        }
      })
      const json = await res.json()
      if (json.success === false) throw new Error(json.error)
      message.success('已创建重试任务')
      fetchTasks()
    } catch (err: any) {
      message.error(`重试失败: ${err.message || '未知错误'}`)
    } finally {
      setRetryingIds((prev) => prev.filter((id) => id !== task.id))
    }
  }

  const renderStatus = (status: string) => {
    if (status === 'completed')
      return (
        <Tag icon={<CheckCircleOutlined />} color="success">
          已完成
        </Tag>
      )
    if (status === 'running')
      return (
        <Tag icon={<SyncOutlined spin />} color="processing">
          运行中
        </Tag>
      )
    if (status === 'failed')
      return (
        <Tag icon={<CloseCircleOutlined />} color="error">
          失败
        </Tag>
      )
    return (
      <Tag icon={<ClockCircleOutlined />} color="default">
        等待中
      </Tag>
    )
  }

  const renderCost = (record: Task) => {
    if (record.gptTokenUsage) {
      const inputTokens = record.gptTokenUsage.input_tokens || 0
      const outputTokens = record.gptTokenUsage.output_tokens || 0
      const inputCost =
        (((5 / 1000000) * inputTokens) / GPT_IMAGE_RMB_RATIO) * 1.5
      const outputCost =
        (((30 / 1000000) * outputTokens) / GPT_IMAGE_RMB_RATIO) * 1.5
      const totalCost = inputCost + outputCost
      const cost2str = (cost: number) =>
        (Math.ceil(cost * 100) / 100).toFixed(2) + ' ￥'
      const tooltipContent = (
        <div>
          <div>输入 tokens: {inputTokens}</div>
          <div>输入预估费用: {cost2str(inputCost)}</div>
          <div>输出 tokens: {outputTokens}</div>
          <div>输出预估费用: {cost2str(outputCost)}</div>
        </div>
      )

      return (
        <Tooltip title={tooltipContent}>
          <Tag color="orange" style={{ cursor: 'help' }}>
            {cost2str(totalCost)}
          </Tag>
        </Tooltip>
      )
    }
    return null
  }

  // 暂时仅显示 GPT-Image 任务
  const gptImageTasks = tasks.filter((t) => t.source === GPT_IMAGE_SOURCE_MODEL)

  return (
    <Card
      title="任务列表"
      className="w-full shadow-sm border-slate-200"
      extra={
        <Button icon={<SyncOutlined />} onClick={fetchTasks} loading={loading}>
          刷新
        </Button>
      }
    >
      <List
        className={styles['task-list']}
        grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }}
        dataSource={gptImageTasks}
        loading={loading}
        pagination={{
          pageSize: 12
        }}
        renderItem={(task) => (
          <List.Item>
            <Card size="small" className="w-full shadow-sm">
              <div className="flex gap-4">
                {/* Left: Image Preview */}
                <div className="flex-shrink-0 w-28 h-36 relative border border-gray-100 rounded overflow-hidden flex items-center justify-center bg-gray-50">
                  {task.status === 'failed' && task.error ? (
                    <Typography.Text
                      type="danger"
                      className="text-xs text-center p-2"
                      ellipsis={{ tooltip: task.error }}
                    >
                      {task.error}
                    </Typography.Text>
                  ) : !task.outputUrl ? (
                    <Typography.Text type="secondary" className="text-xs">
                      暂无图片
                    </Typography.Text>
                  ) : (
                    <Image
                      src={task.outputUrl}
                      alt="result"
                      className="object-cover"
                      style={{ width: '100%', height: '100%' }}
                    />
                  )}
                </div>

                {/* Right: Info and Actions */}
                <div className="flex-grow flex flex-col justify-between overflow-hidden min-w-0">
                  <div>
                    {/* Tags */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      <Tag color="blue">
                        {task.rawTemplate?.usageType === 'image'
                          ? '图片生成'
                          : '视频生成'}
                      </Tag>
                      {renderStatus(task.status)}
                      {renderCost(task)}
                      {task.duration && (
                        <Tag>
                          <ClockCircleOutlined className="mr-1" />
                          {(task.duration / 1000).toFixed(1)}s
                        </Tag>
                      )}
                      {downloadedIds?.includes(task.id) && (
                        <Tag color="cyan">已下载</Tag>
                      )}
                    </div>

                    {/* Title */}
                    {task.rawTemplate?.title && (
                      <Typography.Text
                        strong
                        className="block mb-1 truncate"
                        title={task.rawTemplate.title}
                      >
                        {task.rawTemplate.title}
                      </Typography.Text>
                    )}

                    {/* Prompt */}
                    {task.rawTemplate?.prompt && (
                      <Typography.Paragraph
                        type="secondary"
                        className="text-xs mb-0"
                        ellipsis={{ rows: 2, tooltip: task.rawTemplate.prompt }}
                      >
                        {task.rawTemplate.prompt}
                      </Typography.Paragraph>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end items-center gap-1 mt-2">
                    {task.outputUrl && (
                      <DownloadButton
                        outputUrl={task.outputUrl}
                        fileName={
                          task.rawTemplate?.title || task.rawTemplate.prompt
                        }
                        onDownloaded={() => {
                          if (!downloadedIds?.includes(task.id)) {
                            setDownloadedIds([
                              ...(downloadedIds || []),
                              task.id
                            ])
                          }
                        }}
                      />
                    )}
                    {task.rawTemplate?.title !== TRIAL_TEMPLATE_TITLE && (
                      <Button
                        type="text"
                        icon={<RedoOutlined />}
                        onClick={() => handleRetry(task)}
                        loading={retryingIds.includes(task.id)}
                      />
                    )}
                    <DeleteTaskButton id={task.id} onSuccess={fetchTasks} />
                  </div>
                </div>
              </div>
            </Card>
          </List.Item>
        )}
      />
    </Card>
  )
}
