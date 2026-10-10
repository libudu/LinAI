import { ImageSizeBadge } from '@/client/pages/components/ImageSizeBadge'
import type {
  OrganizeResultDetail,
  OrganizeResultListItem,
} from '@/shared/eagle/organize'
import { Image } from 'antd'
import React, { useEffect, useState } from 'react'
import { RotatableImage } from '../../../components/RotatableImage'
import { VideoPreview } from '../../../components/VideoPreview'
import { useOrganizeMedia } from '../../media'

interface ConfirmImageViewerProps {
  selectedId: string | null
  item?: OrganizeResultListItem | null
  detail?: OrganizeResultDetail | null
}

export const ConfirmImageViewer = React.memo(function ConfirmImageViewer({
  selectedId,
  item,
  detail,
}: ConfirmImageViewerProps) {
  const { previewUrl, mediaType } = useOrganizeMedia()
  const src = selectedId
    ? `${previewUrl(selectedId)}?v=${item?.lastModified ?? detail?.contentVersion ?? ''}`
    : undefined
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false)
  useEffect(() => {
    setVideoPreviewOpen(false)
  }, [selectedId])

  const videoItem =
    mediaType === 'video' &&
    selectedId &&
    detail?.itemId === selectedId &&
    detail.itemName !== null &&
    detail.itemExt &&
    detail.contentVersion &&
    detail.size !== undefined
      ? {
          id: selectedId,
          name: detail.itemName,
          ext: detail.itemExt,
          contentVersion: detail.contentVersion,
          size: detail.size,
          width: detail.width,
          height: detail.height,
        }
      : null

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800/60">
      {selectedId && (
        <>
          {mediaType === 'video' ? (
            <Image
              key={selectedId}
              src={src}
              onClick={() => {
                if (videoItem) setVideoPreviewOpen(true)
              }}
              classNames={{
                root: 'h-full w-full flex items-center justify-center',
                image: `h-full! w-full! object-contain! ${videoItem ? 'cursor-pointer' : ''}`,
              }}
              preview={false}
            />
          ) : (
            <RotatableImage
              key={selectedId}
              itemId={selectedId}
              showOriginal
              src={src}
              classNames={{
                root: 'h-full w-full flex items-center justify-center',
                image: 'h-full! w-full! object-contain!',
              }}
            />
          )}
          <ImageSizeBadge
            src={src!}
            width={item?.width ?? detail?.width}
            height={item?.height ?? detail?.height}
            fileSize={item?.size ?? detail?.size}
          />
        </>
      )}
      {mediaType === 'video' && (
        <VideoPreview
          item={videoPreviewOpen ? videoItem : null}
          onClose={() => setVideoPreviewOpen(false)}
        />
      )}
    </div>
  )
})
