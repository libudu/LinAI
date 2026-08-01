import { EditOutlined, FolderOutlined } from '@ant-design/icons'
import { Button, Card } from 'antd'
import { useState } from 'react'
import { RenameFolderModal } from './RenameFolderModal'

interface TemplateFolderProps {
  folder: string
  onClick: () => void
  onDropTemplate?: (templateId: string, folder: string) => void
  onRenameSuccess?: () => void
}

export function TemplateFolder({
  folder,
  onClick,
  onDropTemplate,
  onRenameSuccess,
}: TemplateFolderProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsModalOpen(true)
  }

  return (
    <>
      <Card
        size="small"
        className={`group cursor-pointer shadow-sm transition-all hover:border-blue-400 hover:shadow-md ${
          isDragOver ? 'border-blue-500 bg-blue-50' : ''
        }`}
        classNames={{
          body: 'py-2!',
        }}
        onClick={onClick}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => {
          setIsDragOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragOver(false)
          const data = e.dataTransfer.getData('application/json')
          if (data) {
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'template' && parsed.id) {
                onDropTemplate?.(parsed.id, folder)
              }
            } catch (err) {
              // Ignore parse errors
            }
          }
        }}
      >
        <div className="flex h-7 items-center gap-2">
          <div className="relative top-0.5">
            <FolderOutlined className="text-xl" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-slate-700">{folder}</div>
          </div>
          <Button
            type="text"
            icon={<EditOutlined />}
            className="hidden! h-7! w-7! group-hover:inline-flex!"
            onClick={handleEditClick}
          />
        </div>
      </Card>

      <RenameFolderModal
        folder={folder}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onSuccess={() => {
          setIsModalOpen(false)
          onRenameSuccess?.()
        }}
      />
    </>
  )
}
