import type { EagleItem } from '@/shared/eagle/types'
import { CloseOutlined } from '@ant-design/icons'
import { Modal } from 'antd'
import { eagleFileUrl } from '../api'
import { formatFileSize } from './formatFileSize'

interface VideoPreviewProps {
  item: EagleItem | null
  onClose: () => void
}

/** 视频沿用大图预览的黑色遮罩，播放器与底部文件信息独立占用空间。 */
export function VideoPreview({ item, onClose }: VideoPreviewProps) {
  return (
    <Modal
      open={item !== null}
      onCancel={onClose}
      title={<span className="sr-only">视频预览</span>}
      footer={null}
      closable={false}
      destroyOnHidden
      width="100%"
      mask={{ blur: false }}
      style={{ top: 0, maxWidth: '100vw', margin: 0, paddingBottom: 0 }}
      styles={{
        mask: { background: 'rgba(0, 0, 0, 0.65)' },
        wrapper: { overflow: 'hidden' },
        container: {
          padding: 0,
          background: 'transparent',
          boxShadow: 'none',
          borderRadius: 0,
        },
        header: { height: 0, margin: 0, padding: 0, background: 'transparent' },
        body: { height: '100dvh', padding: 0 },
      }}
    >
      {item && (
        <div
          className="flex h-full flex-col items-center gap-3 px-4 pt-14 pb-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose()
          }}
        >
          <button
            type="button"
            aria-label="关闭视频预览"
            title="关闭视频预览"
            className="absolute top-3 right-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
            onClick={onClose}
          >
            <CloseOutlined />
          </button>
          <div className="relative min-h-0 w-full flex-1">
            <video
              key={`${item.id}:${item.contentVersion}`}
              src={eagleFileUrl(item.id, item.contentVersion)}
              controls
              autoPlay
              playsInline
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
          <div className="max-h-[20dvh] max-w-full shrink-0 overflow-y-auto rounded-lg bg-black/40 px-3 py-2 text-center text-sm text-white">
            <div className="wrap-anywhere whitespace-pre-wrap">
              {item.name}.{item.ext}
            </div>
            <div className="mt-1 text-white/70">
              {formatFileSize(item.size)}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
