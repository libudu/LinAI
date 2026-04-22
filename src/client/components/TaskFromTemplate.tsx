import { useState, useEffect, useMemo } from 'react'
import { Button, Select, message, Spin, Tag, Popconfirm } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { TaskTemplate } from '../../server/common/template-manager/index'
import { hc } from 'hono/client'
import type { AppType } from '../../server'
import { useTemplates } from '../hooks/useTemplates'
import { useTasks } from '../hooks/useTasks'

const client = hc<AppType>('/')

interface Task {
  id: string
  templateId: string
  prompt: string
  images: string[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  createdAt: number
  usageType: 'image' | 'video'
  error?: string
}

interface TaskFromTemplateProps {
  usageType: 'image' | 'video'
}

export function TaskFromTemplate({ usageType }: TaskFromTemplateProps) {
  const { data: allTemplates = [], refresh: fetchTemplates } = useTemplates()
  const templates = useMemo(() => {
    return allTemplates.filter((t: TaskTemplate) => t.usageType === usageType)
  }, [allTemplates, usageType])

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

  const {
    data: tasks = [],
    loading: tasksLoading,
    refresh: fetchTasks
  } = useTasks(usageType)

  useEffect(() => {
    fetchTemplates()
  }, [usageType])

  const handleCreateTask = async () => {
    if (!selectedTemplate) {
      message.warning('请先选择一个模板')
      return
    }
    try {
      const res = await client.api.task[':usageType']['from-template'].$post({
        param: { usageType },
        // The server route does not declare a validator, so Hono can't infer the JSON body here.
        json: { templateId: selectedTemplate }
      })
      const json = await res.json()
      if (json.success) {
        message.success('创建任务成功')
        setSelectedTemplate(null)
        fetchTasks()
      } else {
        message.error(json.error || '创建任务失败')
      }
    } catch (error) {
      message.error('请求失败')
    }
  }

  const handleDeleteTask = async (id: string) => {
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
      message.error('请求失败')
    }
  }

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'pending':
        return 'default'
      case 'running':
        return 'processing'
      case 'completed':
        return 'success'
      case 'failed':
        return 'error'
      default:
        return 'default'
    }
  }

  const getStatusText = (status: Task['status']) => {
    switch (status) {
      case 'pending':
        return '等待中'
      case 'running':
        return '执行中'
      case 'completed':
        return '已完成'
      case 'failed':
        return '失败'
      default:
        return '未知'
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
        <div className="flex-1">
          <div className="text-sm font-medium text-slate-700 mb-2">
            从模板创建新任务
          </div>
          <Select
            className="w-full"
            placeholder="请选择模板"
            value={selectedTemplate}
            onChange={setSelectedTemplate}
            options={templates.map((t) => ({
              label: t.title ? (
                <span className="font-bold">{t.title}</span>
              ) : (
                t.prompt
              ),
              value: t.id
            }))}
            allowClear
          />
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleCreateTask}
          disabled={!selectedTemplate}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          创建任务
        </Button>
      </div>

      <div className="border border-slate-100 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
          <span className="text-sm font-medium text-slate-700">
            当前任务列表 ({tasks.length})
          </span>
        </div>
        <div className="p-4 max-h-[300px] overflow-y-auto bg-white">
          {tasksLoading && tasks.length === 0 ? (
            <div className="flex justify-center py-8">
              <Spin />
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              暂无任务
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  {task.images && task.images.length > 0 && (
                    <img
                      src={task.images[0]}
                      alt="preview"
                      className="w-12 h-12 object-cover rounded-md border border-slate-200"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm text-slate-700 truncate"
                      title={task.prompt}
                    >
                      {task.prompt}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Tag
                        color={getStatusColor(task.status)}
                        className="m-0 text-xs"
                      >
                        {getStatusText(task.status)}
                      </Tag>
                      <span className="text-xs text-slate-400">
                        {new Date(task.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {task.error && (
                      <div
                        className="text-xs text-red-500 mt-1 truncate"
                        title={task.error}
                      >
                        {task.error}
                      </div>
                    )}
                  </div>
                  <Popconfirm
                    title="确定要删除该任务吗？"
                    onConfirm={() => handleDeleteTask(task.id)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      size="small"
                    />
                  </Popconfirm>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
