import { useEffect, useRef, useState } from 'react'

interface UseCanvasMaskOptions {
  hasAlpha: boolean
  imageStatus: 'loading' | 'ready' | 'error'
  sourceDataUrl: string
  maskMode: 'brush' | 'upload'
  /** Called when the canvas mask changes (drawn or reset) */
  onMaskChange?: (dataUrl: string) => void
  imgRef: React.RefObject<HTMLImageElement | null>
}

export function useCanvasMask({
  hasAlpha,
  imageStatus,
  sourceDataUrl,
  maskMode,
  onMaskChange,
  imgRef,
}: UseCanvasMaskOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [brushSize, setBrushSize] = useState(40)
  const isDrawing = useRef(false)
  const hasDrawn = useRef(false)

  // ── Drawing helpers ────────────────────────────────────────

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const drawAt = (x: number, y: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(x, y, brushSize, 0, Math.PI * 2)
    ctx.fill()
  }

  const syncMaskToParent = () => {
    if (canvasRef.current && onMaskChange) {
      onMaskChange(canvasRef.current.toDataURL('image/png'))
    }
  }

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hasAlpha) return
    isDrawing.current = true
    hasDrawn.current = true
    const pos = getCanvasPos(e)
    drawAt(pos.x, pos.y)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return
    const pos = getCanvasPos(e)
    drawAt(pos.x, pos.y)
  }

  const stopDraw = () => {
    isDrawing.current = false
    syncMaskToParent()
  }

  const initCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const img = imgRef.current
    if (!img) return

    const maxW = 400
    const scale = Math.min(maxW / img.naturalWidth, 1)
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)

    canvas.width = w
    canvas.height = h

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
    syncMaskToParent()
  }

  useEffect(() => {
    if (imageStatus === 'ready' && sourceDataUrl && !hasAlpha && maskMode === 'brush') {
      initCanvas()
      hasDrawn.current = false
    }
  }, [imageStatus, sourceDataUrl, hasAlpha, maskMode])

  const resetCanvas = () => {
    hasDrawn.current = false
    if (onMaskChange) onMaskChange('')
    initCanvas()
  }

  return {
    canvasRef,
    brushSize,
    setBrushSize,
    resetCanvas,
    hasDrawn,
    /** Mouse event handlers to spread on the <canvas> element */
    handlers: {
      onMouseDown: startDraw,
      onMouseMove: draw,
      onMouseUp: stopDraw,
      onMouseLeave: stopDraw,
    },
  }
}
