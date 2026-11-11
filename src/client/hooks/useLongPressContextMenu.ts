import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
  type TouchEvent,
} from 'react'

const LONG_PRESS_DELAY = 500
const MOVE_THRESHOLD = 8
const CLICK_SUPPRESSION_DELAY = 400

function isWithinTrigger(
  event: TouchEvent<HTMLElement> | MouseEvent<HTMLElement>,
) {
  // 放大预览和菜单经 Portal 渲染，合成事件也可能传到外层触发元素。
  return event.currentTarget.contains(event.target as Node)
}

/** 在触点派发 contextmenu，复用鼠标右键的菜单与定位。 */
export function useLongPressContextMenu(disabled: boolean) {
  const pressTimer = useRef<number | undefined>(undefined)
  const clickTimer = useRef<number | undefined>(undefined)
  const startPosition = useRef({ x: 0, y: 0 })
  const suppressClick = useRef(false)

  const cancelPress = useCallback(() => {
    window.clearTimeout(pressTimer.current)
    pressTimer.current = undefined
  }, [])

  const clearClickSuppression = useCallback(() => {
    window.clearTimeout(clickTimer.current)
    clickTimer.current = undefined
    suppressClick.current = false
  }, [])

  useEffect(() => {
    return () => {
      cancelPress()
      clearClickSuppression()
    }
  }, [disabled, cancelPress, clearClickSuppression])

  const onTouchStartCapture = (event: TouchEvent<HTMLElement>) => {
    if (!isWithinTrigger(event)) return
    cancelPress()
    if (event.touches.length !== 1) return

    clearClickSuppression()
    const target = event.currentTarget
    const { clientX, clientY } = event.touches[0]
    startPosition.current = { x: clientX, y: clientY }
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = undefined
      if (!target.isConnected) return

      suppressClick.current = true
      try {
        navigator.vibrate?.(40)
      } catch {
        // 部分平台会拒绝振动请求。
      }
      target.dispatchEvent(
        new window.MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX,
          clientY,
          button: 2,
          buttons: 2,
        }),
      )
    }, LONG_PRESS_DELAY)
  }

  const onTouchMoveCapture = (event: TouchEvent<HTMLElement>) => {
    if (pressTimer.current === undefined || !isWithinTrigger(event)) return
    const touch = event.touches[0]
    const { x, y } = startPosition.current
    if (
      event.touches.length !== 1 ||
      Math.hypot(touch.clientX - x, touch.clientY - y) > MOVE_THRESHOLD
    ) {
      cancelPress()
    }
  }

  const onTouchEndCapture = (event: TouchEvent<HTMLElement>) => {
    if (!isWithinTrigger(event)) return
    cancelPress()
    if (!suppressClick.current) return

    event.preventDefault()
    window.clearTimeout(clickTimer.current)
    clickTimer.current = window.setTimeout(
      clearClickSuppression,
      CLICK_SUPPRESSION_DELAY,
    )
  }

  const onTouchCancelCapture = (event: TouchEvent<HTMLElement>) => {
    if (!isWithinTrigger(event)) return
    cancelPress()
    clearClickSuppression()
  }

  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (!suppressClick.current || !isWithinTrigger(event)) return
    event.preventDefault()
    event.stopPropagation()
    clearClickSuppression()
  }

  return {
    onTouchStartCapture,
    onTouchMoveCapture,
    onTouchEndCapture,
    onTouchCancelCapture,
    onClickCapture,
  }
}
