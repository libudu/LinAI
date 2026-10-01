import { Alert, Button, Spin } from 'antd'
import { useState } from 'react'
import { useTemplates } from '../hooks/useTemplates'
import { RenameFolderModal } from '../TemplateItem/RenameFolderModal'
import { TemplateItemList } from './TemplateItemList'

export function TemplateList() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)

  const { data: templates = [], loading, error, refresh } = useTemplates()

  const imageTemplates = [...templates].sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
  )

  return (
    <>
      <div className="flex max-h-120 w-full flex-col rounded-2xl p-0 md:absolute md:inset-0 md:max-h-none md:p-6">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h3 className="m-0 flex items-center text-base font-semibold text-slate-800 md:text-lg">
            {selectedFolder ? (
              <>
                <span
                  className="cursor-pointer text-slate-500 transition-colors hover:text-blue-600"
                  onClick={() => setSelectedFolder(null)}
                >
                  图片模板 ({imageTemplates.length})
                </span>
                <span className="mx-2 font-normal text-slate-400">/</span>
                <span>
                  {selectedFolder} (
                  {
                    imageTemplates.filter((t) => t.folder === selectedFolder)
                      .length
                  }
                  )
                </span>
              </>
            ) : (
              <span>图片模板 ({imageTemplates.length})</span>
            )}
          </h3>
          {selectedFolder && (
            <Button type="link" onClick={() => setIsRenameModalOpen(true)}>
              重命名文件夹
            </Button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {error && (
            <Alert
              type="error"
              showIcon
              title="模板加载失败"
              description={error.message}
              action={<a onClick={refresh}>重试</a>}
              className="mb-4"
            />
          )}
          {loading && imageTemplates.length === 0 ? (
            <div className="flex h-40 items-center justify-center">
              <Spin />
            </div>
          ) : (
            <TemplateItemList
              filteredTemplates={imageTemplates}
              selectedFolder={selectedFolder}
              onSelectFolder={setSelectedFolder}
            />
          )}
        </div>
      </div>

      {selectedFolder && (
        <RenameFolderModal
          folder={selectedFolder}
          open={isRenameModalOpen}
          onCancel={() => setIsRenameModalOpen(false)}
          onSuccess={(newFolder) => {
            setIsRenameModalOpen(false)
            setSelectedFolder(newFolder)
          }}
        />
      )}
    </>
  )
}
