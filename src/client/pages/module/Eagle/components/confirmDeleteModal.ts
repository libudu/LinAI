import { Modal, message } from 'antd'
import { deleteEagleItem } from '../api'

export interface ConfirmDeleteEagleItemOptions {
  /** 条目 ID（若传入且未提供 onConfirm，则自动调用 deleteEagleItem） */
  id?: string
  /** 条目展示名称 */
  name?: string | null
  /** 确认删除后的回调（配合 id 使用） */
  onDeleted?: (id: string) => Promise<void> | void
  /** 自定义确认逻辑（提供时覆盖默认的 deleteEagleItem 处理） */
  onConfirm?: () => Promise<void> | void
}

/**
 * 弹出移入 Eagle 回收站的二次确认 Modal
 */
export function confirmDeleteEagleItem({
  id,
  name,
  onDeleted,
  onConfirm,
}: ConfirmDeleteEagleItemOptions) {
  const displayName = name?.trim() || '当前图片'
  Modal.confirm({
    title: '移到回收站',
    content: `确定要将「${displayName}」移至 Eagle 回收站吗？`,
    okText: '移到回收站',
    okType: 'danger',
    cancelText: '取消',
    centered: true,
    onOk: async () => {
      if (onConfirm) {
        await onConfirm()
        return
      }
      if (!id) return
      try {
        await deleteEagleItem(id)
        message.success('已移至回收站')
        await onDeleted?.(id)
      } catch (error) {
        message.error(error instanceof Error ? error.message : '删除失败')
        throw error
      }
    },
  })
}
