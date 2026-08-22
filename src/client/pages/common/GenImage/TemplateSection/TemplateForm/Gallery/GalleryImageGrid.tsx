import { DeleteOutlined } from '@ant-design/icons'
import { Tooltip } from 'antd'
import { useMemo } from 'react'
import { normalizeComparableUrl } from './useGalleryImages'

interface GalleryImageGridProps {
  urls: string[]
  selectedUrls: string[]
  unreferencedUrls?: ReadonlySet<string>
  onSelect: (url: string) => void
  onImageError?: (url: string) => void
  onRemove?: (url: string) => void
}

export function GalleryImageGrid({
  urls,
  selectedUrls,
  unreferencedUrls,
  onSelect,
  onImageError,
  onRemove,
}: GalleryImageGridProps) {
  const selectionOrderMap = useMemo(
    () => new Map(selectedUrls.map((url, index) => [url, index + 1])),
    [selectedUrls],
  )

  if (urls.length === 0) {
    return <div className="p-8 text-center text-slate-400">暂无图片</div>
  }

  return (
    <div className="grid max-h-[60vh] grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
      {urls.map((url) => {
        const order = selectionOrderMap.get(url)
        const selected = typeof order === 'number'

        return (
          <div
            key={url}
            className={`group relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 bg-slate-100 transition-all ${
              selected
                ? 'border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.15)]'
                : 'border-transparent hover:border-blue-500'
            }`}
            onClick={() => onSelect(url)}
          >
            <img
              src={`${url}${url.includes('?') ? '&' : '?'}thumb=true`}
              alt="gallery item"
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => onImageError?.(url)}
            />
            {unreferencedUrls?.has(normalizeComparableUrl(url)) && (
              <div className="absolute top-1 left-1 z-10 rounded bg-red-500 px-2 py-0.5 text-xs text-white shadow-sm">
                无引用
              </div>
            )}
            {onRemove && (
              <Tooltip title="从最近使用中移除，但不会删除文件">
                <button
                  type="button"
                  className="pointer-events-none absolute top-1 right-1 z-20 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-white/90 text-slate-500 opacity-0 shadow-sm transition-all group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 hover:text-red-500"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemove(url)
                  }}
                >
                  <DeleteOutlined />
                </button>
              </Tooltip>
            )}
            <div
              className={`absolute inset-0 flex items-center justify-center transition-colors ${
                selected ? 'bg-blue-500/45' : 'bg-black/0 hover:bg-black/5'
              }`}
            >
              {selected && (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-semibold text-blue-600 shadow-sm">
                  {order}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
