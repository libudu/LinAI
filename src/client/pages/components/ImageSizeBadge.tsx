import { useEffect, useState } from 'react'

/** 格式化文件大小，如 0.1MB / 256KB / 500B */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)}KB`
  }
  return `${bytes}B`
}

export interface ImageSizeBadgeProps {
  /** 原图 URL（若未传入已知的 width/height/fileSize，将通过此 URL 自动探测） */
  src?: string
  /** 原图宽度（像素） */
  width?: number
  /** 原图高度（像素） */
  height?: number
  /** 原图文件大小（字节数） */
  fileSize?: number
  /** 是否展示尺寸信息，默认为 true */
  showSize?: boolean
  /** 尺寸徽标自定义 class */
  className?: string
  /** 可选子元素：若传入，本组件将作为定位容器包裹子元素并将尺寸徽标显示在左上角 */
  children?: React.ReactNode
  /** 当包裹 children 时的外层容器 class（默认 'relative'） */
  containerClassName?: string
}

/**
 * 图片尺寸与大小徽标全局组件：
 * 加载完成或直接传入尺寸后，在图片左上角显示半透明深色底的真实尺寸（宽×高）与文件大小（如 1920×1080 1.2MB）
 */
export function ImageSizeBadge({
  src,
  width: propWidth,
  height: propHeight,
  fileSize: propFileSize,
  showSize = true,
  className = '',
  children,
  containerClassName = 'relative',
}: ImageSizeBadgeProps) {
  const [loadedSize, setLoadedSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const [loadedFileSize, setLoadedFileSize] = useState<number | null>(null)

  const hasPropDimensions =
    typeof propWidth === 'number' &&
    typeof propHeight === 'number' &&
    propWidth > 0 &&
    propHeight > 0
  const width = hasPropDimensions ? propWidth : loadedSize?.width
  const height = hasPropDimensions ? propHeight : loadedSize?.height

  const hasPropFileSize = typeof propFileSize === 'number' && propFileSize >= 0
  const fileSize = hasPropFileSize ? propFileSize : loadedFileSize

  useEffect(() => {
    // 若外部已直接提供完整信息，无需任何异步探测
    if (hasPropDimensions && hasPropFileSize) {
      return
    }

    if (!hasPropDimensions) {
      setLoadedSize(null)
    }
    if (!hasPropFileSize) {
      setLoadedFileSize(null)
    }

    if (!src) return

    let cancelled = false

    // 未提供宽高时，通过 Image 加载探测原始尺寸
    if (!hasPropDimensions) {
      const img = new window.Image()
      img.src = src
      if (img.complete && img.naturalWidth) {
        setLoadedSize({ width: img.naturalWidth, height: img.naturalHeight })
      } else {
        img.onload = () => {
          if (!cancelled && img.naturalWidth) {
            setLoadedSize({
              width: img.naturalWidth,
              height: img.naturalHeight,
            })
          }
        }
      }
    }

    // 未提供文件大小时，通过 fetch 探测大小（优先读取 Content-Length 头）
    if (!hasPropFileSize) {
      fetch(src)
        .then((res) => {
          const cl = res.headers.get('content-length')
          if (cl) {
            const bytes = parseInt(cl, 10)
            if (!isNaN(bytes) && bytes > 0) {
              if (!cancelled) setLoadedFileSize(bytes)
              return
            }
          }
          return res.blob().then((blob) => {
            if (!cancelled) setLoadedFileSize(blob.size)
          })
        })
        .catch(() => {})
    }

    return () => {
      cancelled = true
    }
  }, [src, hasPropDimensions, hasPropFileSize])

  const shouldRenderBadge = Boolean(showSize && width && height)

  const badge = shouldRenderBadge ? (
    <div
      className={`pointer-events-none absolute top-0 left-0 z-10 rounded-br bg-black/40 px-1 text-[10px] leading-4 text-white select-none ${className}`}
    >
      {width}×{height}
      {fileSize != null && ` ${formatFileSize(fileSize)}`}
    </div>
  ) : null

  if (children) {
    return (
      <div className={containerClassName}>
        {children}
        {badge}
      </div>
    )
  }

  return badge
}
