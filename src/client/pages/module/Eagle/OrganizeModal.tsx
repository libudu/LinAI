import { Modal } from 'antd'

// 图片整理弹窗：入口在 Toolbar 右侧，依赖视觉接入点配置
// 具体整理功能后续实现，当前为空壳
export function OrganizeModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Modal
      title="图片整理"
      open={open}
      onCancel={onClose}
      footer={null}
      width={920}
      centered
      destroyOnHidden
    />
  )
}
