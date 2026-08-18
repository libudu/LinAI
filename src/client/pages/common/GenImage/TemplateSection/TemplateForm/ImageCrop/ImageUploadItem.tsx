import { CloseCircleFilled, ScissorOutlined } from '@ant-design/icons'
import { Image as AntImage, Button, Tooltip } from 'antd'

interface ImageUploadItemProps {
  url: string
  index: number
  onRemove: (index: number) => void
  onCrop: (target: { index: number; url: string }) => void
}

export function ImageUploadItem({
  url,
  index,
  onRemove,
  onCrop,
}: ImageUploadItemProps) {
  return (
    <div className="group relative h-[120px] w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm">
      <button
        type="button"
        aria-label="删除图片"
        className="absolute top-0 right-1 z-20 cursor-pointer border-0 bg-transparent p-0 text-xl text-red-500 drop-shadow-md transition-all"
        onClick={(event) => {
          event.stopPropagation()
          onRemove(index)
        }}
      >
        <CloseCircleFilled />
      </button>
      <AntImage
        src={url}
        alt={`preview-${index}`}
        width={80}
        height={120}
        className="object-cover"
        preview={{ src: url }}
      />
      <div
        className="absolute right-0 bottom-0 left-0 z-10 flex justify-center bg-black/60 py-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
        onClick={(event) => event.stopPropagation()}
      >
        <Tooltip title="裁剪图片">
          <Button
            type="text"
            size="small"
            aria-label="裁剪图片"
            icon={<ScissorOutlined />}
            className="text-white! hover:bg-white/20!"
            onClick={(event) => {
              event.stopPropagation()
              onCrop({ index, url })
            }}
          />
        </Tooltip>
      </div>
    </div>
  )
}
