import { Button, Modal } from 'antd'
import { ImageDrawToolbar } from './ImageDrawToolbar'
import { ImageDrawViewport } from './ImageDrawViewport'
import { useImageDrawEditor } from './useImageDrawEditor'

interface ImageDrawModalProps {
  open: boolean
  src: string | null
  onCancel: () => void
  onConfirm: (dataUrl: string) => Promise<void>
}

export function ImageDrawModal({
  open,
  src,
  onCancel,
  onConfirm,
}: ImageDrawModalProps) {
  const editor = useImageDrawEditor({ open, src, onConfirm })

  return (
    <Modal
      title="涂抹图片"
      open={open}
      width={800}
      destroyOnHidden
      maskClosable={!editor.modal.submitting}
      keyboard={!editor.modal.submitting}
      closable={!editor.modal.submitting}
      onCancel={() => {
        if (!editor.modal.submitting) onCancel()
      }}
      footer={
        <div className="flex justify-between">
          <Button disabled={editor.modal.submitting} onClick={onCancel}>
            取消
          </Button>
          <Button
            type="primary"
            loading={editor.modal.submitting}
            disabled={!editor.modal.canConfirm}
            onClick={editor.modal.onConfirm}
          >
            提交
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-col gap-3">
        <ImageDrawToolbar {...editor.toolbarProps} />
        <ImageDrawViewport {...editor.viewportProps} />
      </div>
    </Modal>
  )
}
