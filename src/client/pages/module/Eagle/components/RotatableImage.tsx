import { ExportOutlined } from '@ant-design/icons'
import { Image, message, type ImageProps } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { eagleFileUrl, eaglePreviewUrl, fetchEagleItemDetail } from '../api'
import { RotationSaveButton } from './RotationSaveButton'

/** 整理普通/快速确认共用：打开时绑定内容版本，保存后立即刷新当前图片。 */
export function RotatableImage({
  itemId,
  showOriginal = false,
  ...props
}: Omit<ImageProps, 'preview'> & {
  itemId: string
  showOriginal?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [media, setMedia] = useState<{
    id: string
    contentVersion: string
  } | null>(null)
  const sequence = useRef(0)
  useEffect(() => {
    sequence.current++
    setOpen(false)
    setMedia(null)
  }, [itemId])
  useEffect(
    () => () => {
      sequence.current++
    },
    [],
  )
  const version = media?.id === itemId ? media.contentVersion : undefined
  const src = version ? eaglePreviewUrl(itemId, version) : props.src
  return (
    <Image
      {...props}
      src={src}
      preview={{
        open,
        src,
        onOpenChange: (next) => {
          if (busy) return
          setOpen(next)
          const request = ++sequence.current
          if (next)
            void fetchEagleItemDetail(itemId)
              .then((detail) => {
                if (request === sequence.current)
                  setMedia({
                    id: itemId,
                    contentVersion: detail.contentVersion,
                  })
              })
              .catch((error) => {
                if (request === sequence.current)
                  message.error(
                    error instanceof Error ? error.message : '加载媒体信息失败',
                  )
              })
        },
        actionsRender: (originalNode, { transform }) => (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className={busy ? 'pointer-events-none opacity-50' : ''}>
              {originalNode}
            </div>
            <RotationSaveButton
              key={itemId}
              id={itemId}
              contentVersion={version}
              degrees={transform.rotate}
              onBusyChange={setBusy}
              onSaved={(item) => {
                setMedia({ id: item.id, contentVersion: item.contentVersion })
                setOpen(false)
              }}
            />
            {showOriginal && (
              <button
                type="button"
                title="在新标签页查看原图"
                aria-label="在新标签页查看原图"
                className="flex cursor-pointer items-center gap-1 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white/85 hover:bg-black/60 hover:text-white"
                onClick={() =>
                  window.open(eagleFileUrl(itemId, version), '_blank')
                }
              >
                <ExportOutlined />
                <span>查看原图</span>
              </button>
            )}
          </div>
        ),
      }}
    />
  )
}
