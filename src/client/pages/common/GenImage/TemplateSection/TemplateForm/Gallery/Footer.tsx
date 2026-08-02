import type { AppType } from '@/server'
import { Button, message, Modal } from 'antd'
import { hc } from 'hono/client'

type GalleryImageType = 'input' | 'generated'
export type GalleryDeleteSuccessPayload = {
  type: GalleryImageType
  urls: string[]
  deletedCount: number
  skippedCount: number
}

const client = hc<AppType>('/')

interface GalleryFooterProps {
  activeKey: string
  selectedUrls: string[]
  images: Array<{
    url: string
    type: GalleryImageType
    isReferenced: boolean
  }>
  onCancel: () => void
  onConfirm: () => void
  onDelete: (payload: GalleryDeleteSuccessPayload) => Promise<void> | void
}

const getTabType = (activeKey: string): GalleryImageType | null =>
  activeKey === 'input' || activeKey === 'generated' ? activeKey : null

export function GalleryFooter({
  activeKey,
  selectedUrls,
  images,
  onCancel,
  onConfirm,
  onDelete,
}: GalleryFooterProps) {
  const currentTabType = getTabType(activeKey)
  const currentTabImages = currentTabType
    ? images.filter((image) => image.type === currentTabType)
    : []
  const selectedCurrentTabUrls = currentTabImages
    .filter((image) => selectedUrls.includes(image.url))
    .map((image) => image.url)

  const hasSelectedImagesInCurrentTab = selectedCurrentTabUrls.length > 0

  const getDeleteButtonText = () => {
    if (!currentTabType) {
      return ''
    }

    const imageTypeLabel = currentTabType === 'input' ? '输入' : '生成'

    return hasSelectedImagesInCurrentTab
      ? `删除选中的无引用${imageTypeLabel}图片`
      : `删除无引用${imageTypeLabel}图片`
  }

  const getDeleteCandidateUrls = () => {
    if (!currentTabType) {
      return []
    }

    const targetUrls =
      selectedCurrentTabUrls.length > 0
        ? selectedCurrentTabUrls
        : currentTabImages.map((image) => image.url)

    return targetUrls.filter((url) =>
      currentTabImages.some(
        (image) => image.url === url && image.isReferenced === false,
      ),
    )
  }

  const handleDeleteImages = () => {
    if (!currentTabType) {
      return
    }

    const candidateUrls = getDeleteCandidateUrls()
    const imageTypeLabel = currentTabType === 'input' ? '输入' : '生成'

    if (candidateUrls.length === 0) {
      message.info(
        hasSelectedImagesInCurrentTab
          ? `当前选中的${imageTypeLabel}图片均有引用，无法删除`
          : `当前没有可删除的无引用${imageTypeLabel}图片`,
      )
      return
    }

    Modal.confirm({
      title: getDeleteButtonText(),
      content: `确定删除 ${candidateUrls.length} 张无引用${imageTypeLabel}图片吗？`,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await client.api.static.images[
            'delete-unreferenced'
          ].$post({
            json: {
              type: currentTabType,
              urls: candidateUrls,
            },
          })
          const data = await response.json()

          if (!data.success) {
            message.error(data.error || '删除失败')
            return
          }

          await onDelete({
            type: currentTabType,
            urls: candidateUrls,
            deletedCount: data.deletedCount,
            skippedCount: data.skippedCount,
          })

          if (data.skippedCount > 0) {
            message.success(
              `删除完成，已删除 ${data.deletedCount} 张，跳过 ${data.skippedCount} 张有引用图片`,
            )
            return
          }

          message.success(`删除完成，已删除 ${data.deletedCount} 张图片`)
        } catch (error: any) {
          message.error(error.message || '请求失败')
        }
      },
    })
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        {currentTabType && (
          <Button danger onClick={handleDeleteImages}>
            {getDeleteButtonText()}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={onCancel}>取消</Button>
        <Button
          type="primary"
          onClick={onConfirm}
          disabled={selectedUrls.length === 0}
        >
          确认选择
        </Button>
      </div>
    </div>
  )
}
