import { Image } from 'antd'

interface ImageGroupProps {
  images: string[]
}

export function ImageGroup({ images }: ImageGroupProps) {
  if (!images || images.length === 0) return null

  return (
    <div className="w-24 h-24 shrink-0 relative ml-2">
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
              className="absolute rounded-md overflow-hidden bg-slate-100 border border-slate-200 shadow-sm transition-all duration-300 ease-in-out hover:!z-50 hover:scale-105 cursor-pointer"
              style={{
                width: '64px',
                height: '96px',
                left: `${leftOffset}px`,
                zIndex: zIndex,
                transform: `rotate(${rotation}deg)`,
                transformOrigin: 'bottom center'
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
