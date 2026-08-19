import { message } from 'antd'
import { useEffect, useRef, useState, type PointerEvent, type SyntheticEvent } from 'react'
import {
  drawStroke,
  exportDrawnImage,
  getCanvasPoint,
  redrawStrokes,
  type DrawStroke,
} from './drawImage'
import { DEFAULT_DRAW_COLOR } from './ImageDrawToolbar'
import type { BrushPreview, ImageSize } from './ImageDrawViewport'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

interface UseImageDrawEditorOptions {
  open: boolean
  src: string | null
  onConfirm: (dataUrl: string) => Promise<void>
}

function isInsideCanvas(canvas: HTMLCanvasElement, x: number, y: number) {
  const rect = canvas.getBoundingClientRect()
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

export function useImageDrawEditor({ open, src, onConfirm }: UseImageDrawEditorOptions) {
  const imageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const zoomFrameRef = useRef<number | null>(null)
  const activePointerRef = useRef<number | null>(null)
  const currentStrokeRef = useRef<DrawStroke | null>(null)
  const strokeBaseRef = useRef<DrawStroke[]>([])
  const drawingRef = useRef(false)
  const zoomRef = useRef(1)
  const lastPointerRef = useRef<{
    clientX: number
    clientY: number
    pointerType: PointerEvent<HTMLCanvasElement>['pointerType']
  } | null>(null)

  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState<ImageSize | null>(null)
  const [baseDisplaySize, setBaseDisplaySize] = useState<ImageSize | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [color, setColor] = useState(DEFAULT_DRAW_COLOR)
  const [brushSize, setBrushSize] = useState(12)
  const [strokes, setStrokes] = useState<DrawStroke[]>([])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [preview, setPreview] = useState<BrushPreview>({ visible: false, x: 0, y: 0 })

  const resetEditorState = () => {
    activePointerRef.current = null
    currentStrokeRef.current = null
    strokeBaseRef.current = []
    drawingRef.current = false
    zoomRef.current = 1
    lastPointerRef.current = null
    setImageSize(null)
    setBaseDisplaySize(null)
    setLoadError(null)
    setLoading(false)
    setSubmitting(false)
    setColor(DEFAULT_DRAW_COLOR)
    setBrushSize(12)
    setStrokes([])
    setHistoryIndex(0)
    setZoom(1)
    setPreview({ visible: false, x: 0, y: 0 })
  }

  useEffect(() => {
    if (!open || !src) {
      setObjectUrl(null)
      resetEditorState()
      return
    }

    const controller = new AbortController()
    let nextObjectUrl: string | null = null
    resetEditorState()
    setLoading(true)
    setObjectUrl(null)

    fetch(src, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('图片加载失败')
        return response.blob()
      })
      .then((blob) => {
        nextObjectUrl = URL.createObjectURL(blob)
        setObjectUrl(nextObjectUrl)
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoadError(error instanceof Error ? error.message : '图片加载失败')
        setLoading(false)
      })

    return () => {
      controller.abort()
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl)
      const canvas = canvasRef.current
      const pointerId = activePointerRef.current
      if (canvas && pointerId !== null && canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId)
      }
      if (zoomFrameRef.current !== null) {
        cancelAnimationFrame(zoomFrameRef.current)
        zoomFrameRef.current = null
      }
    }
  }, [open, src])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !imageSize) return
    canvas.width = imageSize.width
    canvas.height = imageSize.height
    try {
      redrawStrokes(canvas, strokes.slice(0, historyIndex))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '无法创建图片绘制画布')
    }
  }, [historyIndex, imageSize, strokes])

  const updatePreview = (
    event: Pick<PointerEvent<HTMLCanvasElement>, 'clientX' | 'clientY' | 'pointerType'>,
  ) => {
    lastPointerRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType,
    }
    const canvas = canvasRef.current
    if (!canvas || event.pointerType === 'touch' || submitting) {
      setPreview((current) => ({ ...current, visible: false }))
      return
    }
    const rect = canvas.getBoundingClientRect()
    setPreview({
      visible: isInsideCanvas(canvas, event.clientX, event.clientY),
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }

  const finishStroke = (pointerId: number) => {
    if (activePointerRef.current !== pointerId) return
    const canvas = canvasRef.current
    if (canvas?.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId)
    const stroke = currentStrokeRef.current
    if (stroke) {
      const nextStrokes = [...strokeBaseRef.current, stroke]
      setStrokes(nextStrokes)
      setHistoryIndex(nextStrokes.length)
    }
    activePointerRef.current = null
    currentStrokeRef.current = null
    drawingRef.current = false
  }

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (
      submitting ||
      loadError ||
      activePointerRef.current !== null ||
      (event.pointerType === 'mouse' && event.button !== 0)
    ) {
      return
    }
    const canvas = canvasRef.current
    if (!canvas || !baseDisplaySize || !imageSize) return
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    activePointerRef.current = event.pointerId
    drawingRef.current = true
    const stroke: DrawStroke = {
      color,
      width: brushSize * (imageSize.width / baseDisplaySize.width),
      points: [getCanvasPoint(canvas, event.clientX, event.clientY)],
    }
    strokeBaseRef.current = strokes.slice(0, historyIndex)
    currentStrokeRef.current = stroke
    const context = canvas.getContext('2d')
    if (!context) {
      setLoadError('无法创建图片绘制画布')
      currentStrokeRef.current = null
      finishStroke(event.pointerId)
      return
    }
    drawStroke(context, stroke)
    updatePreview(event)
  }

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    updatePreview(event)
    if (activePointerRef.current !== event.pointerId) return
    const canvas = canvasRef.current
    const stroke = currentStrokeRef.current
    if (!canvas || !stroke) return
    event.preventDefault()
    const point = getCanvasPoint(canvas, event.clientX, event.clientY)
    const previousPoint = stroke.points[stroke.points.length - 1]
    stroke.points.push(point)
    const context = canvas.getContext('2d')
    if (!context) {
      setLoadError('无法创建图片绘制画布')
      currentStrokeRef.current = null
      finishStroke(event.pointerId)
      return
    }
    drawStroke(context, { ...stroke, points: [previousPoint, point] })
  }

  const undo = () => {
    if (!submitting) setHistoryIndex((current) => Math.max(0, current - 1))
  }

  const redo = () => {
    if (!submitting) {
      setHistoryIndex((current) => Math.min(strokes.length, current + 1))
    }
  }

  const resetStrokes = () => {
    if (submitting) return
    setStrokes([])
    setHistoryIndex(0)
  }

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (key === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [historyIndex, open, strokes.length, submitting])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handleWheel = (event: WheelEvent) => {
      if (
        submitting ||
        drawingRef.current ||
        !isInsideCanvas(canvas, event.clientX, event.clientY)
      ) {
        return
      }
      event.preventDefault()
      const currentZoom = zoomRef.current
      const nextZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, currentZoom * Math.exp(-event.deltaY * 0.0015)),
      )
      if (Math.abs(nextZoom - currentZoom) < 0.0001) return
      const oldRect = canvas.getBoundingClientRect()
      const u = (event.clientX - oldRect.left) / oldRect.width
      const v = (event.clientY - oldRect.top) / oldRect.height
      const clientX = event.clientX
      const clientY = event.clientY
      zoomRef.current = nextZoom
      setZoom(nextZoom)
      if (zoomFrameRef.current !== null) cancelAnimationFrame(zoomFrameRef.current)
      zoomFrameRef.current = requestAnimationFrame(() => {
        const viewport = viewportRef.current
        const newRect = canvas.getBoundingClientRect()
        if (viewport) {
          viewport.scrollLeft += newRect.left + u * newRect.width - clientX
          viewport.scrollTop += newRect.top + v * newRect.height - clientY
        }
        const pointer = lastPointerRef.current
        if (pointer) updatePreview(pointer)
        zoomFrameRef.current = null
      })
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [baseDisplaySize, submitting])

  const restoreZoom = () => {
    if (submitting) return
    zoomRef.current = 1
    setZoom(1)
    requestAnimationFrame(() => {
      const viewport = viewportRef.current
      if (!viewport) return
      viewport.scrollTo({
        left: Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2),
        top: Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2),
      })
    })
  }

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const viewport = viewportRef.current
    const naturalWidth = event.currentTarget.naturalWidth
    const naturalHeight = event.currentTarget.naturalHeight
    if (!viewport || !naturalWidth || !naturalHeight) {
      setLoadError('图片加载失败')
      setLoading(false)
      return
    }
    const availableWidth = Math.max(1, viewport.clientWidth - 32)
    const availableHeight = Math.max(1, viewport.clientHeight - 32)
    const scale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight)
    setImageSize({ width: naturalWidth, height: naturalHeight })
    setBaseDisplaySize({ width: naturalWidth * scale, height: naturalHeight * scale })
    setLoading(false)
  }

  const handleImageError = () => {
    setLoadError('图片加载失败')
    setLoading(false)
  }

  const handleConfirm = async () => {
    const image = imageRef.current
    if (!image || historyIndex === 0) return
    setSubmitting(true)
    setPreview((current) => ({ ...current, visible: false }))
    try {
      const dataUrl = await exportDrawnImage(image, strokes.slice(0, historyIndex))
      await onConfirm(dataUrl)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '图片涂抹失败')
    } finally {
      setSubmitting(false)
    }
  }

  const displaySize = baseDisplaySize
    ? { width: baseDisplaySize.width * zoom, height: baseDisplaySize.height * zoom }
    : null
  const canUndo = historyIndex > 0

  return {
    modal: {
      submitting,
      canConfirm: !!imageSize && !loadError && canUndo,
      onConfirm: handleConfirm,
    },
    toolbarProps: {
      color,
      brushSize,
      zoom,
      submitting,
      canUndo,
      canRedo: historyIndex < strokes.length,
      canReset: strokes.length > 0,
      onColorChange: setColor,
      onBrushSizeChange: setBrushSize,
      onRestoreZoom: restoreZoom,
      onUndo: undo,
      onRedo: redo,
      onReset: resetStrokes,
    },
    viewportProps: {
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
      onImageLoad: handleImageLoad,
      onImageError: handleImageError,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerFinish: finishStroke,
      onPointerEnter: updatePreview,
      onPointerLeave: () =>
        setPreview((current) => ({ ...current, visible: false })),
    },
  }
}
