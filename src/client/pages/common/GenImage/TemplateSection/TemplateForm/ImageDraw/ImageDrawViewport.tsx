import { Alert, Spin } from 'antd'
import type { CSSProperties, PointerEvent, RefObject, SyntheticEvent } from 'react'

export interface ImageSize {
  width: number
  height: number
}

export interface BrushPreview {
  visible: boolean
  x: number
  y: number
}

interface ImageDrawViewportProps {
  viewportRef: RefObject<HTMLDivElement | null>
  imageRef: RefObject<HTMLImageElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  objectUrl: string | null
  imageSize: ImageSize | null
  displaySize: ImageSize | null
  preview: BrushPreview
  color: string
  brushSize: number
  zoom: number
  loading: boolean
  loadError: string | null
  onImageLoad: (event: SyntheticEvent<HTMLImageElement>) => void
  onImageError: () => void
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerFinish: (pointerId: number) => void
  onPointerEnter: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerLeave: () => void
}

export function ImageDrawViewport({
  viewportRef,
  imageRef,
  canvasRef,
  objectUrl,
  imageSize,
  displaySize,
  preview,
  color,
  brushSize,
  zoom,
  loading,
  loadError,
  onImageLoad,
  onImageError,
  onPointerDown,
  onPointerMove,
  onPointerFinish,
  onPointerEnter,
  onPointerLeave,
}: ImageDrawViewportProps) {
  const imageStyle: CSSProperties = displaySize
    ? { width: displaySize.width, height: displaySize.height }
    : { maxWidth: 'min(860px, 100%)', maxHeight: '520px' }

  return (
    <div
      ref={viewportRef}
      className="relative h-[min(60vh,560px)] min-h-72 overflow-auto rounded-lg bg-slate-900"
    >
      {loadError ? (
        <div className="flex h-full min-h-72 items-center justify-center p-4">
          <Alert type="error" showIcon message={loadError} />
        </div>
      ) : objectUrl ? (
        <div className="flex h-max min-h-full w-max min-w-full items-center justify-center p-4">
          <div className="relative shrink-0 overflow-hidden" style={displaySize || undefined}>
            <img
              ref={imageRef}
              src={objectUrl}
              alt="待涂抹图片"
              draggable={false}
              className="block select-none"
              style={imageStyle}
              onLoad={onImageLoad}
              onError={onImageError}
            />
            {displaySize && imageSize && (
              <canvas
                ref={canvasRef}
                width={imageSize.width}
                height={imageSize.height}
                aria-label="图片涂抹画布"
                className="absolute inset-0 touch-none cursor-none"
                style={{ width: displaySize.width, height: displaySize.height }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={(event) => onPointerFinish(event.pointerId)}
                onPointerCancel={(event) => onPointerFinish(event.pointerId)}
                onPointerEnter={onPointerEnter}
                onPointerLeave={onPointerLeave}
              />
            )}
            {preview.visible && displaySize && (
              <span
                className="pointer-events-none absolute z-10 rounded-full border border-white shadow-[0_0_0_1px_#000]"
                style={{
                  left: preview.x,
                  top: preview.y,
                  width: brushSize * zoom,
                  height: brushSize * zoom,
                  backgroundColor: `${color}66`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            )}
          </div>
        </div>
      ) : loading ? (
        <div className="flex h-full min-h-72 items-center justify-center">
          <Spin size="large" />
        </div>
      ) : null}
      {loading && objectUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60">
          <Spin size="large" />
        </div>
      )}
    </div>
  )
}
