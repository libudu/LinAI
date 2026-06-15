import { Image, Tag } from 'antd'
import type { KeyboardEvent } from 'react'
import type { MediaImageItem } from '../../types'

interface MediaStatusImageProps {
  item: MediaImageItem
  preview?: boolean
  rootClassName?: string
  imageClassName?: string
  onClick?: () => void
  ariaLabel?: string
}

const statusConfig = {
  keep: {
    label: '已保留',
    className: 'border-blue-200 bg-blue-500/90 text-white',
  },
  delete: {
    label: '预删除',
    className: 'border-red-200 bg-red-500/90 text-white',
  },
} as const

export function MediaStatusImage({
  item,
  preview = true,
  rootClassName = '',
  imageClassName = '',
  onClick,
  ariaLabel,
}: MediaStatusImageProps) {
  const status =
    item.status === 'keep' || item.status === 'delete'
      ? statusConfig[item.status]
      : null

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) {
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick()
    }
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-slate-100 ${onClick ? 'cursor-pointer transition hover:opacity-100' : ''} ${rootClassName}`.trim()}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel}
    >
      <Image
        src={item.previewUrl}
        alt={item.name}
        preview={preview}
        classNames={{
          root: 'h-full w-full',
          image: `h-full! w-full! ${imageClassName}`.trim(),
        }}
      />

      {status ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Tag
            bordered={false}
            className={`rounded-full px-4 py-1 text-base font-medium shadow-sm ${status.className}`}
          >
            {status.label}
          </Tag>
        </div>
      ) : null}
    </div>
  )
}
