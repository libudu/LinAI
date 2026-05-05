import { Radio } from 'antd'
import { useRef, useState } from 'react'
import { usePlatform } from '../../hooks/usePlatform'
import { TemplateForm } from './TemplateForm'
import { TemplateList, TemplateListRef } from './TemplateList'

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
          <TemplateForm onSuccess={handleSuccess} />
        ) : (
          <TemplateList ref={listRef} />
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* 左侧：表单 */}
      <TemplateForm onSuccess={handleSuccess} />

      {/* 右侧：模板列表 */}
      <TemplateList ref={listRef} />
    </div>
  )
}
