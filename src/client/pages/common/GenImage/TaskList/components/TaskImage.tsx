import { Image } from 'antd'
import { useEffect, useState } from 'react'

/** 格式化文件大小，如 0.1MB / 256KB */
function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)}KB`
  }
  return `${bytes}B`
}

/** 单张结果图：加载完成后在左上角显示半透明灰色底的真实尺寸和文件大小 */
export function TaskImage({
  src,
  showSize,
}: {
  src: string
  showSize: boolean
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  )
  const [fileSize, setFileSize] = useState<number | null>(null)

  useEffect(() => {
    // 通过 HEAD 请求取 content-length，避免重复下载图片
    fetch(src, { method: 'HEAD' })
      .then((res) => {
        const length = Number(res.headers.get('content-length'))
        if (Number.isFinite(length) && length > 0) {
          setFileSize(length)
        }
      })
      .catch(() => {})
  }, [src])

  return (
    <>
      <Image
        src={src}
        alt="result"
        classNames={{
          root: 'w-full h-full',
          image: 'w-full! h-full! object-cover',
        }}
        onLoad={(e) => {
          // antd Image 把 onLoad 挂在外层 div 上，真正的 img 在 e.target
          const img = e.target as HTMLImageElement
          setSize({
            width: img.naturalWidth,
            height: img.naturalHeight,
          })
        }}
      />
      {showSize && size && (
        <div className="pointer-events-none absolute top-0 left-0 z-10 rounded-br bg-black/40 px-1 text-[10px] leading-4 text-white">
          {size.width}×{size.height}
          {fileSize !== null && ` · ${formatFileSize(fileSize)}`}
        </div>
      )}
    </>
  )
}
