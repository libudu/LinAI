import { DeleteOutlined, FileTextOutlined } from '@ant-design/icons'
import { Button, Modal } from 'antd'
import { useState } from 'react'

// NovelText 通用卡片：左侧文本图标 + 标题/字数上下排版 + 右侧删除按钮，
// 点击卡片弹出模态框查看原文。用于参考文列表等 NovelText 展示场景
export const NovelTextCard = ({
  title,
  content,
  warning,
  onDelete,
}: {
  title: string
  content: string
  /** 字数旁的额外提示（如超长截取警告） */
  warning?: string
  /** 不传则不显示删除按钮 */
  onDelete?: () => void
}) => {
  const [viewOpen, setViewOpen] = useState(false)

  return (
    <>
      <div
        className="flex cursor-pointer items-center gap-2.5 rounded-md border border-slate-200 px-2.5 py-2 transition-colors hover:border-slate-300 hover:bg-slate-50"
        onClick={() => setViewOpen(true)}
      >
        <FileTextOutlined className="shrink-0 text-base text-slate-400" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm" title={title}>
            {title}
          </div>
          <div className="text-xs text-slate-400">
            {content.length.toLocaleString()} 字
            {warning && <span className="ml-1 text-amber-500">{warning}</span>}
          </div>
        </div>
        {onDelete && (
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          />
        )}
      </div>

      {/* 查看原文 */}
      <Modal
        title={title}
        open={viewOpen}
        onCancel={() => setViewOpen(false)}
        footer={null}
        width={720}
      >
        <div className="max-h-[60vh] overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
          {content}
        </div>
      </Modal>
    </>
  )
}
