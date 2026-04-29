import { Spin } from 'antd'
import { forwardRef, useImperativeHandle, useState } from 'react'
import { useTemplates } from '../../../hooks/useTemplates'
import { TemplateItemList } from './TemplateItemList'
import { TemplateFolder } from './TemplateRootFolder'

export interface TemplateListRef {
  refresh: () => void
}

export const TemplateList = forwardRef<TemplateListRef, unknown>((_, ref) => {
  const [selectedSource, setSelectedSource] = useState<
    'video' | 'image' | null
  >(null)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)

  const { data: templates = [], loading, refresh } = useTemplates()

  useImperativeHandle(ref, () => ({
    refresh,
  }))

  const renderTemplateList = () => {
    if (selectedSource === null) {
      const wanCount = templates.filter((t) => t.usageType === 'video').length
      const geminiCount = templates.filter(
        (t) => t.usageType === 'image',
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

    return (
      <TemplateItemList
        filteredTemplates={filteredTemplates}
        selectedFolder={selectedFolder}
        onSelectFolder={setSelectedFolder}
      />
    )
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 pr-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="m-0 flex items-center text-lg font-semibold text-slate-800">
          {selectedSource === null ? (
            `所有模板 (${templates.length})`
          ) : (
            <>
              <span
                className="cursor-pointer text-slate-500 transition-colors hover:text-blue-600"
                onClick={() => {
                  setSelectedSource(null)
                  setSelectedFolder(null)
                }}
              >
                所有模板 ({templates.length})
              </span>
              <span className="mx-2 font-normal text-slate-400">/</span>
              {selectedFolder ? (
                <>
                  <span
                    className="cursor-pointer text-slate-500 transition-colors hover:text-blue-600"
                    onClick={() => setSelectedFolder(null)}
                  >
                    {selectedSource === 'video' ? '视频' : '图片'}模板 (
                    {
                      templates.filter((t) => t.usageType === selectedSource)
                        .length
                    }
                    )
                  </span>
                  <span className="mx-2 font-normal text-slate-400">/</span>
                  <span>
                    {selectedFolder} (
                    {
                      templates.filter(
                        (t) =>
                          t.usageType === selectedSource &&
                          t.folder === selectedFolder,
                      ).length
                    }
                    )
                  </span>
                </>
              ) : (
                <span>
                  {selectedSource === 'video' ? '视频' : '图片'}模板 (
                  {
                    templates.filter((t) => t.usageType === selectedSource)
                      .length
                  }
                  )
                </span>
              )}
            </>
          )}
        </h3>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Spin />
        </div>
      ) : (
        renderTemplateList()
      )}
    </div>
  )
})
