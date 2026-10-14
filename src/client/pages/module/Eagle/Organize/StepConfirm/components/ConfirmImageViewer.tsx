import { ImageSizeBadge } from '@/client/pages/components/ImageSizeBadge'
import type {
  OrganizeResultDetail,
  OrganizeResultListItem,
} from '@/shared/eagle/organize'
import { Image } from 'antd'
import React from 'react'
import { RotatableImage } from '../../../components/RotatableImage'
import { useOrganizeMedia } from '../../media'

interface ConfirmImageViewerProps {
  selectedId: string | null
  item?: OrganizeResultListItem | null
  detail?: OrganizeResultDetail | null
  onPreviewVideo: () => void
}

export const ConfirmImageViewer = React.memo(function ConfirmImageViewer({
  selectedId,
  item,
  detail,
  onPreviewVideo,
}: ConfirmImageViewerProps) {
  const { previewUrl, mediaType } = useOrganizeMedia()
  const src = selectedId
    ? `${previewUrl(selectedId)}?v=${item?.lastModified ?? detail?.contentVersion ?? ''}`
    : undefined

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800/60">
      {selectedId && (
        <>
          {mediaType === 'video' ? (
            <Image
              key={selectedId}
              src={src}
              onClick={onPreviewVideo}
              classNames={{
                root: 'h-full w-full flex items-center justify-center',
                image: 'h-full! w-full! object-contain! cursor-pointer',
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
    </div>
  )
})
