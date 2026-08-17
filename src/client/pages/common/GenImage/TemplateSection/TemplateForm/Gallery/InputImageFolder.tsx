import { FolderOutlined } from '@ant-design/icons'
import { Tooltip } from 'antd'

interface InputImageFolderProps {
  folder: string
  count: number
  onClick: () => void
}

export function InputImageFolder({
  folder,
  count,
  onClick,
}: InputImageFolderProps) {
  return (
    <button
      type="button"
      className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:shadow-md"
      onClick={onClick}
    >
      <FolderOutlined className="shrink-0 text-2xl text-slate-500" />
      <div className="min-w-0 flex-1">
        <Tooltip title={folder}>
          <div className="truncate font-medium text-slate-700">{folder}</div>
        </Tooltip>
        <div className="text-xs text-slate-400">{count} 张图片</div>
      </div>
    </button>
  )
}
