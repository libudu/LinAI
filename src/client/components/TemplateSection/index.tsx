import { useState, useEffect } from 'react'
import { ScheduleOutlined } from '@ant-design/icons'
import { message } from 'antd'
import { TemplateForm } from './TemplateForm'
import { TemplateList } from './TemplateList'
import { TaskTemplate } from '../../../server/common/template-manager/index'
import { hc } from 'hono/client'
import type { AppType } from '../../../server'

const client = hc<AppType>('/')

export function TemplateSection() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [loading, setLoading] = useState(false)

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await client.api.template.$get()
      const json = await res.json()
      if (json.success) {
        setTemplates(json.data)
      } else {
        message.error(json.error || '获取模板失败')
      }
    } catch (error) {
      message.error('请求失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600 flex items-center justify-center">
          <ScheduleOutlined className="text-xl" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
          任务编排
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：表单 */}
        <TemplateForm onSuccess={fetchTemplates} />

        {/* 右侧：模板列表 */}
        <TemplateList
          templates={templates}
          loading={loading}
          onRefresh={fetchTemplates}
        />
      </div>
    </section>
  )
}
