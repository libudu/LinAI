import { Radio } from 'antd'
import { useRef, useState } from 'react'
import { usePlatform } from '../../hooks/usePlatform'
import { TemplateForm } from './TemplateForm'
import { TemplateList, TemplateListRef } from './TemplateList'

const ModuleWrapper = ({ children }: { children: React.ReactElement }) => {
  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:relative md:w-1/2 md:p-6">
      {children}
    </div>
  )
}

export function TemplateSection() {
  const listRef = useRef<TemplateListRef>(null)
  const { isMobile } = usePlatform()
  const [activeTab, setActiveTab] = useState<'form' | 'list'>('form')

  const handleSuccess = () => {
    listRef.current?.refresh()
  }

  if (isMobile) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-center">
          <Radio.Group
            value={activeTab}
            size="large"
            onChange={(e) => setActiveTab(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: '新增模板', value: 'form' },
              { label: '模板列表', value: 'list' },
            ]}
          />
        </div>
        {activeTab === 'form' ? (
          <ModuleWrapper>
            <TemplateForm onSuccess={handleSuccess} />
          </ModuleWrapper>
        ) : (
          <ModuleWrapper>
            <TemplateList ref={listRef} />
          </ModuleWrapper>
        )}
      </div>
    )
  }

  return (
    <div className="flex gap-6">
      {/* 左侧：表单 */}
      <ModuleWrapper>
        <TemplateForm onSuccess={handleSuccess} />
      </ModuleWrapper>

      {/* 右侧：模板列表 */}
      <ModuleWrapper>
        <TemplateList ref={listRef} />
      </ModuleWrapper>
    </div>
  )
}
