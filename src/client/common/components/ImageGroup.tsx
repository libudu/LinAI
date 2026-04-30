import { Image } from 'antd'

interface ImageGroupProps {
  images: string[]
  width: number
  height: number
}

const MAX_VISIBLE_IMAGES = 8
const WARP_MAX_IMAGE_COUNT = 3

export function ImageGroup({ images, width, height }: ImageGroupProps) {
  if (!images || images.length === 0) return null

  const visibleImages = images.slice(0, MAX_VISIBLE_IMAGES)
  const hiddenImages = images.slice(MAX_VISIBLE_IMAGES)
  const rows = visibleImages.length > WARP_MAX_IMAGE_COUNT ? 2 : 1
  const rowCounts =
    rows === 1
      ? [visibleImages.length]
      : [
          Math.ceil(visibleImages.length / 2),
          Math.floor(visibleImages.length / 2),
        ]
  const cardHeight = rows === 1 ? height : height * 0.7
  const cardWidth = Math.round(cardHeight * 0.64)
  const stepY = rows > 1 ? (height - cardHeight) / (rows - 1) : 0

  return (
    <div
      className="relative shrink-0 rounded-lg bg-gray-200"
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      <Image.PreviewGroup>
        {visibleImages.map((url, index) => {
          const rowIndex = rows === 1 ? 0 : index < rowCounts[0] ? 0 : 1
          const colIndex =
            rows === 1 ? index : rowIndex === 0 ? index : index - rowCounts[0]

          const cols = rowCounts[rowIndex] ?? 0
          const overlapX = 0.45
          const maxStepX = cols > 1 ? (width - cardWidth) / (cols - 1) : 0
          const stepX =
            cols > 1
              ? cols === 2
                ? Math.min(
                    maxStepX,
                    Math.max(cardWidth * overlapX, maxStepX * 0.85),
                  )
                : maxStepX
              : 0
          const groupWidth = cardWidth + (cols - 1) * stepX
          const offsetX = (width - groupWidth) / 2

          const isFirst = colIndex === 0
          const isLast = colIndex === cols - 1 && cols > 1
          const rotation = isFirst ? -6 : isLast ? 6 : 0
          const leftOffset = offsetX + colIndex * stepX
          const topOffset = rowIndex * stepY
          const zIndex =
            (rowIndex === 0 ? 10 : 8) + (isFirst ? 2 : isLast ? 0 : 1)

          return (
            <div
              key={index}
              className="absolute cursor-pointer overflow-hidden rounded-md border border-slate-200 bg-slate-100 shadow-sm transition-all duration-300 ease-in-out hover:!z-50 hover:scale-105"
              style={{
                width: `${cardWidth}px`,
                height: `${cardHeight}px`,
                left: `${leftOffset}px`,
                top: `${topOffset}px`,
                zIndex: zIndex,
                transform: `rotate(${rotation}deg)`,
                transformOrigin: 'bottom center',
              }}
            >
              <Image
                src={url}
                alt={`image-${index}`}
                width={cardWidth}
                height={cardHeight}
                className="object-cover"
                style={{ objectFit: 'cover' }}
              />
            </div>
          )
        })}
        {hiddenImages.length > 0 && (
          <div style={{ display: 'none' }}>
            {hiddenImages.map((url, index) => (
              <Image
                key={`hidden-${index}`}
                src={url}
                alt={`image-hidden-${index}`}
              />
            ))}
          </div>
        )}
      </Image.PreviewGroup>
      <div className="absolute right-1 bottom-0 z-20 rounded bg-black/50 px-1 text-[10px] text-white">
        {images.length}张
      </div>
    </div>
  )
}
