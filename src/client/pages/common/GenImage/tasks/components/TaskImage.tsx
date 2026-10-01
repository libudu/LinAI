import { Image } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'

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
  const rootRef = useRef<HTMLDivElement | null>(null)

  // 图片本体加载完成后读取真实尺寸，并复用浏览器缓存再取一次文件大小
  const handleLoaded = useCallback(
    (img: HTMLImageElement) => {
      if (!img.naturalWidth) return
      setSize({
        width: img.naturalWidth,
        height: img.naturalHeight,
      })
      fetch(src)
        .then((res) => res.blob())
        .then((blob) => setFileSize(blob.size))
        .catch(() => {})
    },
    [src],
  )

  useEffect(() => {
    // 处理命中缓存时 load 事件先于 React 挂载触发的情况
    const img = rootRef.current?.querySelector('img')
    if (img?.complete) {
      handleLoaded(img)
    }
  }, [handleLoaded])

  return (
    <>
      {/* antd Image 不透传 ref，用 contents 容器包裹以便查找内部 img */}
      <div ref={rootRef} className="contents">
        <Image
          src={src}
          alt="result"
          classNames={{
            root: 'w-full h-full',
            image: 'w-full! h-full! object-cover',
          }}
          onLoad={(e) => {
            // antd Image 把 onLoad 挂在外层 div 上，真正的 img 在 e.target
            handleLoaded(e.target as HTMLImageElement)
          }}
        />
      </div>
      {showSize && size && (
        <div className="pointer-events-none absolute top-0 left-0 z-10 rounded-br bg-black/40 px-1 text-[10px] leading-4 text-white">
          {size.width}×{size.height}
          {fileSize !== null && ` ${formatFileSize(fileSize)}`}
        </div>
      )}
    </>
  )
}
