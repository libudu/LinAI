import {
  BorderOutlined,
  FullscreenExitOutlined,
  OneToOneOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import React, { useEffect, useRef, useState } from 'react'
import type { CellResult, GridSize } from '../types'

interface GridPreviewProps {
  image: HTMLImageElement | null
  grid: GridSize
  cells: CellResult[][] | null
  selectedCell: { row: number; column: number } | null
  mode: 'source' | 'result'
  onSelectCell: (cell: { row: number; column: number } | null) => void
  title?: string
}

export function GridPreview({
  image,
  grid,
  cells,
  selectedCell,
  mode,
  onSelectCell,
  title,
}: GridPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // 缩放与平移状态
  const [zoom, setZoom] = useState<number>(1) // 1 = fit
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const offsetStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const [showGridLines, setShowGridLines] = useState<boolean>(true)

  // 渲染区域逻辑尺寸与原始比例
  const [viewportSize, setViewportSize] = useState<{
    width: number
    height: number
  }>({
    width: 400,
    height: 400,
  })

  // 监听容器大小变化自适应，严格防止重复设置导致循环渲染
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect
        const newW = Math.max(10, Math.floor(cr.width))
        const newH = Math.max(10, Math.floor(cr.height))
        setViewportSize((prev) => {
          if (prev.width === newW && prev.height === newH) {
            return prev
          }
          return { width: newW, height: newH }
        })
      }
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 计算图片适应容器的基础宽高
  const imgWidth = image?.naturalWidth || image?.width || 1
  const imgHeight = image?.naturalHeight || image?.height || 1
  const imgAspect = imgWidth / imgHeight

  // 容器宽高比与适应尺寸
  let baseDrawWidth = viewportSize.width - 24
  let baseDrawHeight = viewportSize.height - 24
  if (baseDrawWidth / baseDrawHeight > imgAspect) {
    baseDrawWidth = baseDrawHeight * imgAspect
  } else {
    baseDrawHeight = baseDrawWidth / imgAspect
  }
  baseDrawWidth = Math.max(50, baseDrawWidth)
  baseDrawHeight = Math.max(50, baseDrawHeight)

  // 绘制 Canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 限制 dpr 最大为 2，避免 4K/视网膜屏疯狂暴增显存
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(10, viewportSize.width)
    const h = Math.max(10, viewportSize.height)

    const targetW = Math.round(w * dpr)
    const targetH = Math.round(h * dpr)
    // 仅在真实尺寸发生变更时才重新分配 Canvas 内存，防止 OOM
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
    }

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    // 计算当前缩放和平移下的绘图区域
    const drawW = baseDrawWidth * zoom
    const drawH = baseDrawHeight * zoom
    const drawX = (w - drawW) / 2 + offset.x
    const drawY = (h - drawH) / 2 + offset.y

    // 1. 绘制主体内容
    if (mode === 'source') {
      // 绘制原始图像
      ctx.drawImage(image, drawX, drawY, drawW, drawH)
    } else if (mode === 'result' && cells && cells.length > 0) {
      // 绘制拼豆结果色块
      const cols = grid.columns
      const rows = grid.rows

      for (let r = 0; r < rows; r++) {
        const cellY = drawY + (r * drawH) / rows
        const nextY = drawY + ((r + 1) * drawH) / rows
        const ch = nextY - cellY

        for (let c = 0; c < cols; c++) {
          const cellX = drawX + (c * drawW) / cols
          const nextX = drawX + ((c + 1) * drawW) / cols
          const cw = nextX - cellX

          const cell = cells[r]?.[c]
          ctx.fillStyle = cell ? cell.color : '#FFFFFF'
          // 填充矩形，多填 0.3 像素避免浮点缝隙
          ctx.fillRect(cellX, cellY, cw + 0.3, ch + 0.3)
        }
      }
    }

    // 2. 绘制网格线
    if (showGridLines && grid.columns > 0 && grid.rows > 0) {
      const cols = grid.columns
      const rows = grid.rows

      ctx.save()
      ctx.lineWidth = 1

      if (mode === 'source') {
        // 原图模式使用半透明线，确保深浅背景均可见
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
      } else {
        // 结果模式使用细微边框线
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
      }

      ctx.beginPath()
      // 纵向线
      for (let c = 0; c <= cols; c++) {
        const x = Math.round(drawX + (c * drawW) / cols) + 0.5
        ctx.moveTo(x, drawY)
        ctx.lineTo(x, drawY + drawH)
      }
      // 横向线
      for (let r = 0; r <= rows; r++) {
        const y = Math.round(drawY + (r * drawH) / rows) + 0.5
        ctx.moveTo(drawX, y)
        ctx.lineTo(drawX + drawW, y)
      }
      ctx.stroke()
      ctx.restore()
    }

    // 3. 高亮绘制选中单元格
    if (
      selectedCell &&
      selectedCell.row >= 0 &&
      selectedCell.row < grid.rows &&
      selectedCell.column >= 0 &&
      selectedCell.column < grid.columns
    ) {
      const cols = grid.columns
      const rows = grid.rows
      const r = selectedCell.row
      const c = selectedCell.column

      const selX = drawX + (c * drawW) / cols
      const nextX = drawX + ((c + 1) * drawW) / cols
      const selY = drawY + (r * drawH) / rows
      const nextY = drawY + ((r + 1) * drawH) / rows
      const selW = nextX - selX
      const selH = nextY - selY

      ctx.save()
      // 绘制亮橙色高亮选框
      ctx.strokeStyle = '#F97316' // orange-500
      ctx.lineWidth = Math.max(2, Math.min(4, selW / 6))
      ctx.strokeRect(selX, selY, selW, selH)

      // 选框内侧微弱半透明填充增强对比
      ctx.fillStyle = 'rgba(249, 115, 22, 0.2)'
      ctx.fillRect(selX, selY, selW, selH)
      ctx.restore()
    }

    ctx.restore()
  }, [
    image,
    grid,
    cells,
    selectedCell,
    mode,
    zoom,
    offset,
    showGridLines,
    viewportSize,
    baseDrawWidth,
    baseDrawHeight,
  ])

  // 处理点击选择单元格
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // 若刚刚在进行拖拽平移，不触发点击选择
    if (isDragging) return
    const canvas = canvasRef.current
    if (!canvas || !image) return

    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    const drawW = baseDrawWidth * zoom
    const drawH = baseDrawHeight * zoom
    const drawX = (viewportSize.width - drawW) / 2 + offset.x
    const drawY = (viewportSize.height - drawH) / 2 + offset.y

    // 检查是否点击在绘图区域内部
    if (
      clickX >= drawX &&
      clickX <= drawX + drawW &&
      clickY >= drawY &&
      clickY <= drawY + drawH
    ) {
      const relX = clickX - drawX
      const relY = clickY - drawY
      const col = Math.floor((relX / drawW) * grid.columns)
      const row = Math.floor((relY / drawH) * grid.rows)

      if (row >= 0 && row < grid.rows && col >= 0 && col < grid.columns) {
        onSelectCell({ row, column: col })
      }
    }
  }

  // 鼠标拖拽平移
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return // 只响应鼠标左键
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    offsetStartRef.current = { ...offset }
    setIsDragging(false)

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - dragStartRef.current.x
      const dy = moveEvent.clientY - dragStartRef.current.y
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        setIsDragging(true)
        setOffset({
          x: offsetStartRef.current.x + dx,
          y: offsetStartRef.current.y + dy,
        })
      }
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // 滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85
    setZoom((prev) => {
      const next = Math.max(0.5, Math.min(10, prev * zoomFactor))
      return Number(next.toFixed(2))
    })
  }

  const handleResetZoom = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
      {/* 头部标题与视图工具栏 */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 px-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {title || (mode === 'source' ? '原图与网格对齐' : '拼豆效果预览')}
          </span>
          <span className="text-xs text-slate-400">
            {grid.columns} × {grid.rows}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip title={showGridLines ? '隐藏网格线' : '显示网格线'}>
            <Button
              type={showGridLines ? 'primary' : 'text'}
              ghost={showGridLines}
              size="small"
              icon={<BorderOutlined />}
              onClick={() => setShowGridLines((v) => !v)}
            />
          </Tooltip>

          <Tooltip title="放大">
            <Button
              type="text"
              size="small"
              icon={<ZoomInOutlined />}
              onClick={() =>
                setZoom((z) => Math.min(10, Number((z * 1.25).toFixed(2))))
              }
            />
          </Tooltip>

          <Tooltip title="缩小">
            <Button
              type="text"
              size="small"
              icon={<ZoomOutOutlined />}
              onClick={() =>
                setZoom((z) => Math.max(0.5, Number((z * 0.8).toFixed(2))))
              }
            />
          </Tooltip>

          <Tooltip title="100% 比例">
            <Button
              type="text"
              size="small"
              icon={<OneToOneOutlined />}
              onClick={() => {
                setZoom(2)
                setOffset({ x: 0, y: 0 })
              }}
            />
          </Tooltip>

          <Tooltip title="适应窗口">
            <Button
              type="text"
              size="small"
              icon={<FullscreenExitOutlined />}
              onClick={handleResetZoom}
            />
          </Tooltip>
        </div>
      </div>

      {/* 画布主工作区 */}
      <div
        ref={containerRef}
        className="relative flex-1 cursor-grab overflow-hidden bg-slate-50/50 select-none active:cursor-grabbing dark:bg-slate-950/40"
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
      >
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="absolute inset-0 block h-full w-full"
        />

        {/* 底部悬浮提示 */}
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-[11px] text-white/80 backdrop-blur-xs">
          滚轮缩放 {Math.round(zoom * 100)}% · 拖拽平移 · 点击选择单元格
        </div>
      </div>
    </div>
  )
}
