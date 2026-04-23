import { useEffect, useState } from 'react'
import { Card, Table, Tag, Typography, Button, Image, Tooltip } from 'antd'
import {
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons'
import { hc } from 'hono/client'
import type { AppType } from '../../../server'
import type { Task } from '../../../server/common/task-manager'
import { DeleteTaskButton } from './DeleteTaskButton'

const client = hc<AppType>('/')

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)

  const fetchTasks = async () => {
    setLoading(true)
    try {
      const resImage = await client.api.task[':usageType'].$get({
        param: { usageType: 'image' }
      })
      const resVideo = await client.api.task[':usageType'].$get({
        param: { usageType: 'video' }
      })

      const imageJson = await resImage.json()
      const videoJson = await resVideo.json()

      let allTasks: Task[] = []
      if (imageJson.success) {
        allTasks = [...allTasks, ...(imageJson.data as Task[])]
      }
      if (videoJson.success) {
        allTasks = [...allTasks, ...(videoJson.data as Task[])]
      }

      allTasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      setTasks(allTasks)
    } catch (error) {
      console.error('Failed to fetch tasks', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
    const timer = setInterval(fetchTasks, 5000)
    return () => clearInterval(timer)
  }, [])

  const columns = [
    {
      title: '类型',
      dataIndex: ['rawTemplate', 'usageType'],
      key: 'usageType',
      render: (type: string) => (
        <Tag color={type === 'image' ? 'blue' : 'purple'}>
          {type === 'image' ? '图片生成' : '视频生成'}
        </Tag>
      ),
      width: 100
    },
    {
      title: '标题',
      dataIndex: ['rawTemplate', 'title'],
      key: 'title',
      render: (text: string) => text || '-'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
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
      },
      width: 120
    },
    {
      title: () => (
        <div>
          耗时
          <Tooltip
            title={
              <div>
                <div>1k 图：约20~40秒</div>
                <div>2k 图：约40~60秒</div>
              </div>
            }
          >
            <QuestionCircleOutlined className="ml-0.5" />
          </Tooltip>
        </div>
      ),
      dataIndex: 'duration',
      key: 'duration',
      render: (duration: number) =>
        duration ? `${(duration / 1000).toFixed(1)}s` : '-',
      width: 80
    },
    {
      title: '预估费用',
      key: 'cost',
      render: (_: any, record: Task) => {
        if (record.source === 'gpt-image-2' && record.gptTokenUsage) {
          const inputTokens = record.gptTokenUsage.input_tokens || 0
          const outputTokens = record.gptTokenUsage.output_tokens || 0
          const inputCost = (20 / 1000000) * inputTokens * 1.4
          const outputCost = (120 / 1000000) * outputTokens * 1.4
          const totalCost =
            Math.ceil(inputCost * 100) / 100 + Math.ceil(outputCost * 100) / 100
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
              <span style={{ cursor: 'help', borderBottom: '1px dashed #ccc' }}>
                {cost2str(totalCost)}
              </span>
            </Tooltip>
          )
        }
        return '-'
      },
      width: 100
    },
    {
      title: '结果',
      dataIndex: 'outputUrl',
      key: 'outputUrl',
      render: (outputUrl: string, record: Task) => {
        if (record.status === 'failed' && record.error) {
          return (
            <Typography.Text
              type="danger"
              ellipsis={{ tooltip: record.error }}
              style={{ maxWidth: 200 }}
            >
              {record.error}
            </Typography.Text>
          )
        }
        if (!outputUrl) return '-'
        if (record.rawTemplate?.usageType === 'image') {
          return (
            <Image
              src={outputUrl}
              alt="result"
              height={40}
              style={{ borderRadius: 4, objectFit: 'cover' }}
            />
          )
        }
        return (
          <a href={outputUrl} target="_blank" rel="noreferrer">
            查看
          </a>
        )
      }
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Task) => (
        <DeleteTaskButton
          id={record.id}
          usageType={record.rawTemplate?.usageType as 'image' | 'video'}
          onSuccess={fetchTasks}
        />
      ),
      width: 80
    }
  ]

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
      <Table
        dataSource={tasks}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 10 }}
        loading={loading}
      />
    </Card>
  )
}
