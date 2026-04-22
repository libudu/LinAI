import { useRef } from 'react'
import { ScheduleOutlined } from '@ant-design/icons'
import { TemplateForm } from './TemplateForm'
import { TemplateList, TemplateListRef } from './TemplateList'

export function TemplateSection() {
  const listRef = useRef<TemplateListRef>(null)

  const handleSuccess = () => {
    listRef.current?.refresh()
  }

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
        <TemplateForm onSuccess={handleSuccess} />

        {/* 右侧：模板列表 */}
        <TemplateList ref={listRef} />
      </div>
    </section>
  )
}
