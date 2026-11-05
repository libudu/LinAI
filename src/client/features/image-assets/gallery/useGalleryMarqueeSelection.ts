import { useEffect, useRef, useState } from 'react'

interface SelectionRect {
  left: number
  top: number
  width: number
  height: number
}

interface MarqueeSelectionOptions {
  urls: string[]
  selectedUrls: string[]
  onSelectionChange?: (urls: string[]) => void
}

export function useGalleryMarqueeSelection({
  urls,
  selectedUrls,
  onSelectionChange,
}: MarqueeSelectionOptions) {
  const gridRef = useRef<HTMLDivElement>(null)
  const selectedUrlsRef = useRef(selectedUrls)
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)

  useEffect(() => {
    selectedUrlsRef.current = selectedUrls
  }, [selectedUrls])

  useEffect(() => {
    const grid = gridRef.current
    if (!grid || !onSelectionChange) return

    let gesture: {
      pointerId: number
      originX: number
      originY: number
      startX: number
      startY: number
      clientX: number
      clientY: number
      initialUrls: string[]
      items: Array<SelectionRect & { url: string }>
      dragging: boolean
    } | null = null
    let suppressClick = false
    let animationFrame = 0

    const getPoint = (clientX: number, clientY: number) => {
      const bounds = grid.getBoundingClientRect()
      return {
        x: Math.max(
          0,
          Math.min(grid.scrollWidth, clientX - bounds.left + grid.scrollLeft),
        ),
        y: Math.max(
          0,
          Math.min(grid.scrollHeight, clientY - bounds.top + grid.scrollTop),
        ),
      }
    }

    const updateSelection = () => {
      if (!gesture?.dragging) return
      const point = getPoint(gesture.clientX, gesture.clientY)
      const rect = {
        left: Math.min(gesture.startX, point.x),
        top: Math.min(gesture.startY, point.y),
        width: Math.abs(point.x - gesture.startX),
        height: Math.abs(point.y - gesture.startY),
      }
      setSelectionRect(rect)
      const nextUrls = new Set(gesture.initialUrls)
      gesture.items.forEach((item) => {
        if (
          item.left < rect.left + rect.width &&
          item.left + item.width > rect.left &&
          item.top < rect.top + rect.height &&
          item.top + item.height > rect.top
        ) {
          nextUrls.add(item.url)
        }
      })
      const next = [...nextUrls]
      if (
        next.length !== selectedUrlsRef.current.length ||
        next.some((url, index) => url !== selectedUrlsRef.current[index])
      ) {
        selectedUrlsRef.current = next
        onSelectionChange(next)
      }
    }

    const finish = (cancelled = false) => {
      if (!gesture) return
      const previous = gesture
      gesture = null
      cancelAnimationFrame(animationFrame)
      animationFrame = 0
      if (grid.hasPointerCapture(previous.pointerId)) {
        grid.releasePointerCapture(previous.pointerId)
      }
      setSelectionRect(null)
      if (cancelled && previous.dragging) {
        selectedUrlsRef.current = previous.initialUrls
        onSelectionChange(previous.initialUrls)
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      suppressClick = false
      if (
        event.pointerType !== 'mouse' ||
        event.button !== 0 ||
        !event.isPrimary ||
        !(event.target instanceof Element) ||
        event.target.closest('button, a, input, textarea, select')
      ) {
        return
      }
      const bounds = grid.getBoundingClientRect()
      // 滚动条仍保留原生拖动行为。
      if (
        event.clientX >= bounds.left + grid.clientLeft + grid.clientWidth ||
        event.clientY >= bounds.top + grid.clientTop + grid.clientHeight
      ) {
        return
      }
      const point = getPoint(event.clientX, event.clientY)
      gesture = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        startX: point.x,
        startY: point.y,
        clientX: event.clientX,
        clientY: event.clientY,
        initialUrls: [...selectedUrlsRef.current],
        items: Array.from(
          grid.querySelectorAll<HTMLElement>('[data-gallery-url]'),
          (item) => {
            const itemBounds = item.getBoundingClientRect()
            return {
              url: item.dataset.galleryUrl!,
              left: itemBounds.left - bounds.left + grid.scrollLeft,
              top: itemBounds.top - bounds.top + grid.scrollTop,
              width: itemBounds.width,
              height: itemBounds.height,
            }
          },
        ),
        dragging: false,
      }
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return
      gesture.clientX = event.clientX
      gesture.clientY = event.clientY
      if (!gesture.dragging) {
        if (
          Math.hypot(
            event.clientX - gesture.originX,
            event.clientY - gesture.originY,
          ) < 5
        ) {
          return
        }
        gesture.dragging = true
        suppressClick = true
        grid.setPointerCapture(event.pointerId)
      }
      event.preventDefault()
      updateSelection()
      if (!animationFrame) animationFrame = requestAnimationFrame(autoScroll)
    }

    // 输入图片根目录的滚动容器在网格外，需沿父级寻找。
    const autoScroll = () => {
      animationFrame = 0
      if (!gesture?.dragging) return
      let scroller: HTMLElement | null = grid
      while (scroller) {
        if (
          /auto|scroll/.test(getComputedStyle(scroller).overflowY) &&
          scroller.scrollHeight > scroller.clientHeight
        ) {
          break
        }
        scroller = scroller.parentElement
      }
      if (scroller) {
        const bounds = scroller.getBoundingClientRect()
        const edge = Math.min(40, bounds.height / 4)
        const speed =
          gesture.clientY < bounds.top + edge
            ? -Math.min(16, (bounds.top + edge - gesture.clientY) / 3)
            : gesture.clientY > bounds.bottom - edge
              ? Math.min(16, (gesture.clientY - bounds.bottom + edge) / 3)
              : 0
        if (speed) {
          scroller.scrollTop += speed
          updateSelection()
        }
      }
      animationFrame = requestAnimationFrame(autoScroll)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== gesture?.pointerId) return
      gesture.clientX = event.clientX
      gesture.clientY = event.clientY
      updateSelection()
      finish()
    }
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId === gesture?.pointerId) finish(true)
    }
    const onClick = (event: MouseEvent) => {
      if (!suppressClick) return
      suppressClick = false
      event.preventDefault()
      event.stopPropagation()
    }
    const onDragStart = (event: DragEvent) => event.preventDefault()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && gesture?.dragging) {
        event.preventDefault()
        event.stopPropagation()
        finish(true)
      }
    }
    const onBlur = () => finish(true)

    grid.addEventListener('pointerdown', onPointerDown)
    grid.addEventListener('click', onClick, true)
    grid.addEventListener('dragstart', onDragStart)
    grid.addEventListener('lostpointercapture', onPointerCancel)
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('scroll', updateSelection, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onBlur)
    return () => {
      finish()
      grid.removeEventListener('pointerdown', onPointerDown)
      grid.removeEventListener('click', onClick, true)
      grid.removeEventListener('dragstart', onDragStart)
      grid.removeEventListener('lostpointercapture', onPointerCancel)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('scroll', updateSelection, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [urls, onSelectionChange])

  return { gridRef, selectionRect }
}
