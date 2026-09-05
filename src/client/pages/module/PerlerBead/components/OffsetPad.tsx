import { UndoOutlined } from '@ant-design/icons'
import { Button, InputNumber, Tooltip } from 'antd'
import React, { useCallback, useRef } from 'react'

interface OffsetPadProps {
  offsetX: number // 0 ~ 1，默认 0.5，精度 0.01
  offsetY: number // 0 ~ 1，默认 0.5，精度 0.01
  onChange: (x: number, y: number) => void
  disabled?: boolean
}

export function OffsetPad({
  offsetX,
  offsetY,
  onChange,
  disabled = false,
}: OffsetPadProps) {
  const padRef = useRef<HTMLDivElement>(null)

  const clampAndRound = (val: number): number => {
    return Number(Math.max(0, Math.min(1, val)).toFixed(2))
  }

  const currentX = clampAndRound(offsetX ?? 0.5)
  const currentY = clampAndRound(offsetY ?? 0.5)

  // 基于鼠标/触摸绝对坐标更新数值
  const handlePointerCoord = useCallback(
    (clientX: number, clientY: number) => {
      if (disabled || !padRef.current) return
      const rect = padRef.current.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const nx = clampAndRound((clientX - rect.left) / rect.width)
      const ny = clampAndRound((clientY - rect.top) / rect.height)
      onChange(nx, ny)
    },
    [disabled, onChange],
  )

  // 鼠标按下与拖拽事件
  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled || e.button !== 0) return
    e.preventDefault()
    handlePointerCoord(e.clientX, e.clientY)

    const handleMouseMove = (moveEvent: MouseEvent) => {
      handlePointerCoord(moveEvent.clientX, moveEvent.clientY)
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // 触摸屏事件
  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled || e.touches.length === 0) return
    const touch = e.touches[0]
    handlePointerCoord(touch.clientX, touch.clientY)

    const handleTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length === 0) return
      const t = moveEvent.touches[0]
      handlePointerCoord(t.clientX, t.clientY)
    }

    const handleTouchEnd = () => {
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }

    window.addEventListener('touchmove', handleTouchMove)
    window.addEventListener('touchend', handleTouchEnd)
  }

  // 重置回居中 (0.50, 0.50)
  const handleReset = () => {
    if (disabled) return
    onChange(0.5, 0.5)
  }

  const isShifted = currentX !== 0.5 || currentY !== 0.5

  return (
    <div className="flex items-center gap-3">
      {/* 1. 二维方框控制器 */}
      <Tooltip title="在方框内点击或拖动以调整 X/Y 偏移（中心点 0.50 为无偏移）">
        <div
          ref={padRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          className={`relative h-20 w-20 shrink-0 cursor-crosshair rounded-lg border bg-slate-100 shadow-2xs select-none transition-colors dark:bg-slate-900 ${
            disabled
              ? 'cursor-not-allowed opacity-50 border-slate-200 dark:border-slate-800'
              : 'border-slate-300 hover:border-orange-400 dark:border-slate-700 dark:hover:border-orange-500'
          }`}
        >
          {/* 十字参考准星 */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-slate-300/80 dark:border-slate-700/80" />
          <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 border-l border-dashed border-slate-300/80 dark:border-slate-700/80" />

          {/* 中心微弱圆点 */}
          <div className="pointer-events-none absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300 dark:bg-slate-700" />

          {/* 可视化手柄圆点 */}
          <div
            className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500 shadow-md ring-2 ring-white transition-transform dark:ring-slate-950"
            style={{
              left: `${currentX * 100}%`,
              top: `${currentY * 100}%`,
            }}
          />
        </div>
      </Tooltip>

      {/* 2. 右侧 X/Y 轴精确数值输入 */}
      <div className="flex flex-1 flex-col justify-center space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
            X
          </span>
          <InputNumber
            size="small"
            min={0}
            max={1}
            step={0.01}
            precision={2}
            value={currentX}
            disabled={disabled}
            onChange={(val) => {
              if (val !== null) {
                onChange(clampAndRound(val), currentY)
              }
            }}
            className="w-full"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="w-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Y
          </span>
          <InputNumber
            size="small"
            min={0}
            max={1}
            step={0.01}
            precision={2}
            value={currentY}
            disabled={disabled}
            onChange={(val) => {
              if (val !== null) {
                onChange(currentX, clampAndRound(val))
              }
            }}
            className="w-full"
          />
        </div>

        {/* 快捷重置按钮 */}
        <div className="flex justify-end pt-0.5">
          <Button
            size="small"
            type="text"
            icon={<UndoOutlined />}
            disabled={disabled || !isShifted}
            onClick={handleReset}
            className="h-5 px-1 text-[11px] text-slate-400 hover:text-orange-500 dark:text-slate-500"
          >
            重置居中
          </Button>
        </div>
      </div>
    </div>
  )
}
