import {
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react'

const LONG_PRESS_MS = 400
const DOUBLE_TAP_MS = 300
const DRAG_THRESHOLD = 12
const PIXELS_PER_SECOND = 12

interface Gesture {
  pointerId: number
  surface: HTMLDivElement
  video: HTMLVideoElement
  x: number
  y: number
  mode: 'pending' | 'speed' | 'seek' | 'cancelled'
  originalRate: number
  seekStart: number
  seekTarget: number
}

type GestureFeedback =
  | { mode: 'speed' }
  | { mode: 'seek'; time: number; offset: number }
  | null

function isControl(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('[data-video-controls]')
}

/** 视频画面与两侧留白共用手势，控件保留自身的点击和拖动操作。 */
export function useVideoPlayerGestures(
  videoRef: RefObject<HTMLVideoElement | null>,
  showControls: () => void,
  togglePlayback: () => void,
) {
  const gestureRef = useRef<Gesture | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null)
  const [feedback, setFeedback] = useState<GestureFeedback>(null)
  const [active, setActive] = useState(false)

  const clearTimer = () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
  }
  const restoreRate = (gesture: Gesture) => {
    if (gesture.mode === 'speed')
      gesture.video.playbackRate = gesture.originalRate
  }
  const releaseCapture = (gesture: Gesture) => {
    if (gesture.surface.hasPointerCapture(gesture.pointerId))
      gesture.surface.releasePointerCapture(gesture.pointerId)
  }
  const cancel = () => {
    clearTimer()
    const gesture = gestureRef.current
    gestureRef.current = null
    if (gesture) {
      restoreRate(gesture)
      releaseCapture(gesture)
    }
    lastTapRef.current = null
    setFeedback(null)
    setActive(false)
  }

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) cancel()
    }
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('blur', cancel)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      // 卸载、切换视频时也必须恢复倍速，避免留下临时状态。
      clearTimer()
      const gesture = gestureRef.current
      gestureRef.current = null
      if (gesture) {
        restoreRate(gesture)
        releaseCapture(gesture)
      }
    }
  }, [])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current) {
      if (gestureRef.current.pointerId !== event.pointerId) cancel()
      return
    }
    if (!event.isPrimary || event.button !== 0 || isControl(event.target))
      return
    const video = videoRef.current
    if (!video) return
    event.currentTarget.focus({ preventScroll: true })
    const gesture: Gesture = {
      pointerId: event.pointerId,
      surface: event.currentTarget,
      video,
      x: event.clientX,
      y: event.clientY,
      mode: 'pending',
      originalRate: video.playbackRate,
      seekStart: video.currentTime,
      seekTarget: video.currentTime,
    }
    gestureRef.current = gesture
    setActive(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (gestureRef.current !== gesture || gesture.mode !== 'pending') return
      gesture.mode = 'speed'
      gesture.originalRate = video.playbackRate
      video.playbackRate = 2
      lastTapRef.current = null
      setFeedback({ mode: 'speed' })
    }, LONG_PRESS_MS)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const dx = event.clientX - gesture.x
    const dy = event.clientY - gesture.y
    if (gesture.mode === 'cancelled') return
    if (gesture.mode !== 'seek') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_THRESHOLD) return
      clearTimer()
      restoreRate(gesture)
      lastTapRef.current = null
      if (
        Math.abs(dx) <= Math.abs(dy) ||
        !Number.isFinite(gesture.video.duration) ||
        gesture.video.duration <= 0
      ) {
        gesture.mode = 'cancelled'
        setFeedback(null)
        return
      }
      gesture.mode = 'seek'
      gesture.seekStart = gesture.video.currentTime
      showControls()
    }
    gesture.seekTarget = Math.min(
      gesture.video.duration,
      Math.max(0, gesture.seekStart + Math.round(dx / PIXELS_PER_SECOND)),
    )
    setFeedback({
      mode: 'seek',
      time: gesture.seekTarget,
      offset: gesture.seekTarget - gesture.seekStart,
    })
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    // 使用松开位置更新目标，避免最后一次移动未派发导致少跳一段。
    onPointerMove(event)
    clearTimer()
    gestureRef.current = null
    restoreRate(gesture)
    releaseCapture(gesture)
    setFeedback(null)
    setActive(false)
    if (gesture.mode === 'seek') {
      gesture.video.currentTime = gesture.seekTarget
      showControls()
    } else if (gesture.mode === 'pending') {
      showControls()
      const lastTap = lastTapRef.current
      if (
        lastTap &&
        event.timeStamp - lastTap.time <= DOUBLE_TAP_MS &&
        Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) <= 32
      ) {
        lastTapRef.current = null
        togglePlayback()
      } else {
        lastTapRef.current = {
          time: event.timeStamp,
          x: event.clientX,
          y: event.clientY,
        }
      }
    }
  }

  return {
    active,
    feedback,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: cancel,
      onLostPointerCapture: () => {
        if (gestureRef.current) cancel()
      },
      onContextMenu: (event: MouseEvent<HTMLDivElement>) => {
        if (!isControl(event.target)) event.preventDefault()
      },
    },
  }
}
