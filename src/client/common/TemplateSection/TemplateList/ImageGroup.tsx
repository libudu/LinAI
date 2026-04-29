import { Image } from 'antd'

interface ImageGroupProps {
  images: string[]
}

export function ImageGroup({ images }: ImageGroupProps) {
  if (!images || images.length === 0) return null

  return (
    <div className="relative ml-2 h-24 w-24 shrink-0">
      <Image.PreviewGroup>
        {images.map((url, index) => {
          const isFirst = index === 0
          const isLast = index === images.length - 1 && images.length > 1
          const rotation = isFirst ? -6 : isLast ? 6 : 0
          const leftOffset = index * 10
          const zIndex = isFirst ? 10 : isLast ? 8 : 9

          return (
            <div
              key={index}
              className="absolute cursor-pointer overflow-hidden rounded-md border border-slate-200 bg-slate-100 shadow-sm transition-all duration-300 ease-in-out hover:!z-50 hover:scale-105"
              style={{
                width: '64px',
                height: '96px',
                left: `${leftOffset}px`,
                zIndex: zIndex,
                transform: `rotate(${rotation}deg)`,
                transformOrigin: 'bottom center',
              }}
            >
              <Image
                src={url}
                alt="template"
                width={64}
                height={96}
                className="object-cover"
                style={{ objectFit: 'cover' }}
              />
            </div>
          )
        })}
      </Image.PreviewGroup>
    </div>
  )
}
