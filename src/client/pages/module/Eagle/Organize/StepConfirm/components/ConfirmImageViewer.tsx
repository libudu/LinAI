import { ImageSizeBadge } from '@/client/pages/components/ImageSizeBadge'
import type {
  OrganizeResultDetail,
  OrganizeResultListItem,
} from '@/shared/eagle/organize'
import { ExportOutlined } from '@ant-design/icons'
import { Image } from 'antd'
import React, { useEffect, useState } from 'react'
import { eagleFileUrl } from '../../../api'
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
          <Image
            key={selectedId}
            src={previewUrl(selectedId)}
            onClick={() => {
              if (videoItem) setVideoPreviewOpen(true)
            }}
            classNames={{
              root: 'h-full w-full flex items-center justify-center',
              image: `h-full! w-full! object-contain! ${videoItem ? 'cursor-pointer' : ''}`,
            }}
            preview={
              mediaType === 'video'
                ? false
                : {
                    src: previewUrl(selectedId),
                    toolbarRender: (originalNode) => (
                      <div className="flex items-center gap-2">
                        {originalNode}
                        <button
                          type="button"
                          title="在新标签页查看原图"
                          aria-label="在新标签页查看原图"
                          className="flex cursor-pointer items-center gap-1 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white/85 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
                          onClick={() =>
                            window.open(eagleFileUrl(selectedId), '_blank')
                          }
                        >
                          <ExportOutlined />
                          <span>查看原图</span>
                        </button>
                      </div>
                    ),
                  }
            }
          />
          <ImageSizeBadge
            src={previewUrl(selectedId)}
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
