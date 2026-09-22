import { ImageSizeBadge } from '@/client/pages/components/ImageSizeBadge'
import type {
  OrganizeResultDetail,
  OrganizeResultListItem,
} from '@/shared/eagle/organize'
import { ExportOutlined } from '@ant-design/icons'
import { Image } from 'antd'
import React from 'react'
import { eagleFileUrl } from '../../../api'

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
  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800/60">
      {selectedId && (
        <>
          <Image
            key={selectedId}
            src={eagleFileUrl(selectedId)}
            classNames={{
              root: 'h-full w-full flex items-center justify-center',
              image: 'h-full! w-full! object-contain!',
            }}
            preview={{
              src: eagleFileUrl(selectedId),
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
            }}
          />
          <ImageSizeBadge
            src={eagleFileUrl(selectedId)}
            width={item?.width ?? detail?.width}
            height={item?.height ?? detail?.height}
            fileSize={item?.size ?? detail?.size}
          />
        </>
      )}
    </div>
  )
})
