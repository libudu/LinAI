import { useEffect, useState } from 'react'
import {
  Card,
  Table,
  Tag,
  Typography,
  Button,
  message,
  Modal,
  Checkbox,
  Image
} from 'antd'
import {
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined
} from '@ant-design/icons'
import { hc } from 'hono/client'
import { useLocalStorageState } from 'ahooks'
import type { AppType } from '../../../server'
import type { Task } from '../../../server/common/task-manager'

const client = hc<AppType>('/')

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useLocalStorageState(
    'skipDeleteTaskConfirm',
    {
      defaultValue: false
    }
  )

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

  const doDelete = async (id: string, usageType: 'image' | 'video') => {
    try {
      const res = await client.api.task[':usageType'][':id'].$delete({
        param: { usageType, id }
      })
      const json = await res.json()
      if (json.success) {
        message.success('删除成功')
        fetchTasks()
      } else {
        message.error(json.error || '删除失败')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleDelete = (id: string, usageType: 'image' | 'video') => {
    if (skipDeleteConfirm) {
      doDelete(id, usageType)
      return
    }

    let skipNext = false

    Modal.confirm({
      title: '确认删除任务？',
      content: (
        <div>
          <p>删除任务将同时删除其生成的图片/视频文件，且不可恢复。</p>
          <Checkbox
            onChange={(e) => {
              skipNext = e.target.checked
            }}
          >
            下次不再提醒
          </Checkbox>
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        if (skipNext) {
          setSkipDeleteConfirm(true)
        }
        doDelete(id, usageType)
      }
    })
  }

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
      title: '耗时',
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
          const cost =
            ((20 / 1000000) * inputTokens + (120 / 1000000) * outputTokens) *
            1.4
          return `￥${cost.toFixed(4)}`
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
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() =>
            handleDelete(
              record.id,
              record.rawTemplate?.usageType as 'image' | 'video'
            )
          }
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
        pagination={{ pageSize: 5 }}
        loading={loading}
      />
    </Card>
  )
}
