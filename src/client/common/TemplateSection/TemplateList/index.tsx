import { useState, forwardRef, useImperativeHandle } from 'react'
import { Spin } from 'antd'
import { useTemplates } from '../../../hooks/useTemplates'
import { TemplateFolder } from './TemplateFolder'
import { TemplateItemList } from './TemplateItemList'

export interface TemplateListRef {
  refresh: () => void
}

export const TemplateList = forwardRef<TemplateListRef, unknown>((_, ref) => {
  const [selectedSource, setSelectedSource] = useState<
    'video' | 'image' | null
  >(null)

  const { data: templates = [], loading, refresh } = useTemplates()

  useImperativeHandle(ref, () => ({
    refresh
  }))

  const renderTemplateList = () => {
    if (selectedSource === null) {
      const wanCount = templates.filter((t) => t.usageType === 'video').length
      const geminiCount = templates.filter(
        (t) => t.usageType === 'image'
      ).length

      return (
        <TemplateFolder
          wanCount={wanCount}
          geminiCount={geminiCount}
          onSelect={setSelectedSource}
        />
      )
    }

    const filteredTemplates = templates
      .filter((t) => t.usageType === selectedSource)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

    return <TemplateItemList filteredTemplates={filteredTemplates} />
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 pr-4 flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-slate-800 m-0 flex items-center">
          {selectedSource === null ? (
            `所有模板 (${templates.length})`
          ) : (
            <>
              <span
                className="cursor-pointer hover:text-blue-600 transition-colors text-slate-500"
                onClick={() => setSelectedSource(null)}
              >
                所有模板 ({templates.length})
              </span>
              <span className="text-slate-400 font-normal mx-2">/</span>
              <span>
                {selectedSource === 'video' ? '视频' : '图片'}模板 (
                {templates.filter((t) => t.usageType === selectedSource).length}
                )
              </span>
            </>
          )}
        </h3>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-40">
          <Spin />
        </div>
      ) : (
        renderTemplateList()
      )}
    </div>
  )
})
