import {
  CheckOutlined,
  DeleteOutlined,
  RedoOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import { Button, ColorPicker, Divider, Slider, Tooltip } from 'antd'

const DRAW_COLOR_PRESETS = [
  { color: '#ff4d4f', label: '红色画笔' },
  { color: '#fadb14', label: '黄色画笔' },
  { color: '#1677ff', label: '蓝色画笔' },
  { color: '#000000', label: '黑色画笔' },
  { color: '#ffffff', label: '白色画笔' },
]

export const DEFAULT_DRAW_COLOR = DRAW_COLOR_PRESETS[0].color

interface ImageDrawToolbarProps {
  color: string
  brushSize: number
  zoom: number
  submitting: boolean
  canUndo: boolean
  canRedo: boolean
  canReset: boolean
  onColorChange: (color: string) => void
  onBrushSizeChange: (size: number) => void
  onRestoreZoom: () => void
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
}

export function ImageDrawToolbar({
  color,
  brushSize,
  zoom,
  submitting,
  canUndo,
  canRedo,
  canReset,
  onColorChange,
  onBrushSizeChange,
  onRestoreZoom,
  onUndo,
  onRedo,
  onReset,
}: ImageDrawToolbarProps) {
  return (
    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
      {DRAW_COLOR_PRESETS.map((preset) => (
        <Tooltip key={preset.color} title={preset.label}>
          <button
            type="button"
            aria-label={preset.label}
            disabled={submitting}
            className="relative h-7 w-7 shrink-0 cursor-pointer rounded-full border border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: preset.color,
              outline: color === preset.color ? '2px solid #1677ff' : undefined,
              outlineOffset: 2,
            }}
            onClick={() => onColorChange(preset.color)}
          >
            {color === preset.color && (
              <CheckOutlined
                className={
                  preset.color === '#ffffff' ? 'text-slate-700' : 'text-white'
                }
              />
            )}
          </button>
        </Tooltip>
      ))}
      <Tooltip title="自定义画笔颜色">
        <ColorPicker
          value={color}
          disabled={submitting}
          disabledAlpha
          onChange={(value) => onColorChange(value.toHexString())}
        />
      </Tooltip>
      <Divider type="vertical" className="h-7!" />
      <span className="shrink-0 text-sm">画笔大小</span>
      <Slider
        min={4}
        max={64}
        step={2}
        value={brushSize}
        disabled={submitting}
        className="w-32 shrink-0"
        onChange={onBrushSizeChange}
      />
      <span className="w-12 shrink-0 text-sm tabular-nums">{brushSize} px</span>
      <Tooltip title="滚轮缩放，点击恢复 100%">
        <Button type="text" disabled={submitting} onClick={onRestoreZoom}>
          {Math.round(zoom * 100)}%
        </Button>
      </Tooltip>
      <Divider type="vertical" className="h-7!" />
      <Tooltip title="撤销">
        <Button
          type="text"
          aria-label="撤销"
          icon={<UndoOutlined />}
          disabled={submitting || !canUndo}
          onClick={onUndo}
        />
      </Tooltip>
      <Tooltip title="重做">
        <Button
          type="text"
          aria-label="重做"
          icon={<RedoOutlined />}
          disabled={submitting || !canRedo}
          onClick={onRedo}
        />
      </Tooltip>
      <Tooltip title="重置">
        <Button
          type="text"
          aria-label="重置"
          icon={<DeleteOutlined />}
          disabled={submitting || !canReset}
          onClick={onReset}
        />
      </Tooltip>
    </div>
  )
}
