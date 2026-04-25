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
import { useLocalStorageState } from 'ahooks'
import { hc } from 'hono/client'
import type { AppType } from '../../../server'
import type { Task } from '../../../server/common/task-manager'
import { useTasks } from '../../hooks/useTasks'
import {
  GPT_IMAGE_RMB_RATIO,
  MODEL_GROUP_RATIO
} from '../../hooks/useGPTImageQuota'
import { TaskItemDeleteButton } from './components/TaskItemDeleteButton'
import styles from './index.module.scss'
import { TaskItemDownloadButton } from './components/TaskItemDownloadButton'
import { TRIAL_TEMPLATE_TITLE } from '../../../server/common/template-manager/enum'
import { GPT_IMAGE_SOURCE_MODEL } from '../../../server/module/gpt-image/enum'
import { TaskListHeader } from './TaskListHeader'

const client = hc<AppType>('/')

export function TaskList() {
  const { data: tasks = [], loading, refresh: fetchTasks } = useTasks()
  const [downloadedIds, setDownloadedIds] = useLocalStorageState<string[]>(
    'downloadedTaskIds',
    { defaultValue: [] }
  )

  const handleRetry = async (task: Task) => {
    await client.api.gptImage.generate.$post({
      json: {
        templateId: task.rawTemplate?.id || '',
        size: task.size || '2k'
      }
    })
    message.success('已创建重试任务')
    setTimeout(() => {
      fetchTasks()
    }, 500)
  }

  const renderStatus = (status: string) => {
    if (status === 'completed')
      return (
        <Tag icon={<CheckCircleOutlined />} color="success">
          完成
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
          <div>
            以上为不考虑分组和画质、根据token消耗粗略计算，以实际扣费为准
          </div>
          <div>
            实际费用根据分组可用性不同会有 1 ~ 1.5 倍波动，high 画质额外乘 4 倍
          </div>
        </div>
      )

      return (
        <Tooltip title={tooltipContent}>
          <Tag color="orange" style={{ cursor: 'help' }}>
            约{cost2str(totalCost)}
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
      className="w-full shadow-sm border-slate-200"
      styles={{ body: { paddingTop: 0 } }}
    >
      <TaskListHeader
        tasks={gptImageTasks}
        downloadedIds={downloadedIds || []}
        setDownloadedIds={setDownloadedIds}
        fetchTasks={fetchTasks}
        loading={loading}
      />
      <List
        className={styles['task-list']}
        grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }}
        dataSource={gptImageTasks}
        loading={loading}
        pagination={{
          pageSize: 10
        }}
        renderItem={(task) => (
          <List.Item>
            <Card size="small" className="w-full shadow-sm">
              <div className="flex gap-4">
                {/* Left: Image Preview */}
                <div className="shrink-0 w-28 h-36 relative border border-gray-100 rounded overflow-hidden flex items-center justify-center bg-gray-50">
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
                      classNames={{
                        root: 'w-full h-full',
                        image: 'w-full! h-full! object-cover'
                      }}
                    />
                  )}
                </div>

                {/* Right: Info and Actions */}
                <div className="flex-grow flex flex-col justify-between overflow-hidden min-w-0">
                  <div>
                    {/* Tags */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {task.status !== 'completed' && renderStatus(task.status)}
                      <Tag color="blue">
                        {task.rawTemplate?.usageType === 'image'
                          ? '图片'
                          : '视频'}
                      </Tag>
                      {downloadedIds?.includes(task.id) ? (
                        <Tag color="cyan">已下载</Tag>
                      ) : (
                        <Tag color="orange">未下载</Tag>
                      )}
                      {renderCost(task)}
                      {task.duration && (
                        <Tag>
                          <ClockCircleOutlined className="mr-1" />
                          {(task.duration / 1000).toFixed(1)}s
                        </Tag>
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
                        className="text-xs mb-0!"
                        ellipsis={{ rows: 2, tooltip: task.rawTemplate.prompt }}
                      >
                        {task.rawTemplate.prompt}
                      </Typography.Paragraph>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end items-center gap-1 mt-2">
                    {task.outputUrl && (
                      <TaskItemDownloadButton
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
                      <Tooltip title="重试">
                        <Button
                          type="text"
                          icon={<RedoOutlined />}
                          onClick={() => handleRetry(task)}
                        />
                      </Tooltip>
                    )}
                    <TaskItemDeleteButton
                      id={task.id}
                      onSuccess={() => {
                        setTimeout(() => {
                          fetchTasks()
                        }, 500)
                      }}
                    />
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
