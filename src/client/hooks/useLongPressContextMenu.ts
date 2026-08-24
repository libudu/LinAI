import { useCallback, useEffect, useRef } from 'react'

export interface UseLongPressContextMenuOptions {
  /** 长按触发延迟（毫秒），默认 500 */
  delay?: number
  /** 手指移动容差（像素），超过则视为滑动并取消长按，默认 8 */
  moveThreshold?: number
  /** 是否开启触觉反馈，默认 true */
  vibrate?: boolean
  /** 长按触发时的回调（可选） */
  onLongPress?: (e: {
    clientX: number
    clientY: number
    target: HTMLElement
  }) => void
}

/**
 * 移动端长按触发右键菜单（contextmenu）的通用 Hook。
 *
 * 核心特性：
 * 1. 按住达到指定时长（默认 500ms）后合成并在目标 DOM 派发原生 `contextmenu` 事件，
 *    antd Dropdown 捕获后在手指按下位置弹出菜单；
 * 2. 在移动距离超过阈值（默认 8px）或触摸取消时自动终止计时，不干扰列表平滑滚动；
 * 3. 支持触发时轻微振动反馈（40ms）；
 * 4. 长按触发后自动阻止 touchend 默认行为并在捕获阶段拦截随后的 click 事件，
 *    防止长按抬手时误触发子元素的点击事件（如打开大图预览、选中节点等）。
 */
export function useLongPressContextMenu(
  options: UseLongPressContextMenuOptions = {},
) {
  const {
    delay = 500,
    moveThreshold = 8,
    vibrate = true,
    onLongPress,
  } = options

  const timerRef = useRef<number | null>(null)
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const targetRef = useRef<HTMLElement | null>(null)
  const isLongPressRef = useRef(false)
  const preventClickRef = useRef(false)
  const clearPreventClickTimerRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearTimer()
      if (clearPreventClickTimerRef.current !== null) {
        window.clearTimeout(clearPreventClickTimerRef.current)
      }
    }
  }, [clearTimer])

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (e.touches.length !== 1) {
        clearTimer()
        return
      }

      const touch = e.touches[0]
      startPosRef.current = { x: touch.clientX, y: touch.clientY }
      targetRef.current = e.currentTarget
      isLongPressRef.current = false

      clearTimer()

      timerRef.current = window.setTimeout(() => {
        isLongPressRef.current = true
        preventClickRef.current = true

        if (vibrate && typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(40)
          } catch {
            // 忽略某些平台振动权限错误
          }
        }

        const target = targetRef.current
        if (target) {
          const { x, y } = startPosRef.current
          onLongPress?.({ clientX: x, clientY: y, target })

          const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            button: 2,
            buttons: 2,
          })
          target.dispatchEvent(event)
        }
      }, delay)
    },
    [clearTimer, delay, onLongPress, vibrate],
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (timerRef.current === null) return
      if (e.touches.length !== 1) {
        clearTimer()
        return
      }

      const touch = e.touches[0]
      const dx = touch.clientX - startPosRef.current.x
      const dy = touch.clientY - startPosRef.current.y
      if (Math.hypot(dx, dy) > moveThreshold) {
        clearTimer()
      }
    },
    [clearTimer, moveThreshold],
  )

  const onTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      clearTimer()
      if (isLongPressRef.current) {
        e.preventDefault()
        // 设置延迟重置 preventClick，确保随后的模拟 click 事件被拦截
        if (clearPreventClickTimerRef.current !== null) {
          window.clearTimeout(clearPreventClickTimerRef.current)
        }
        clearPreventClickTimerRef.current = window.setTimeout(() => {
          preventClickRef.current = false
          isLongPressRef.current = false
        }, 400)
      }
    },
    [clearTimer],
  )

  const onTouchCancel = useCallback(() => {
    clearTimer()
    isLongPressRef.current = false
  }, [clearTimer])

  const onClickCapture = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (preventClickRef.current || isLongPressRef.current) {
      e.preventDefault()
      e.stopPropagation()
      preventClickRef.current = false
      isLongPressRef.current = false
    }
  }, [])

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    onClickCapture,
  }
}
