import {
  ClearOutlined,
  DownloadOutlined,
  LockOutlined,
  RedoOutlined,
  ScanOutlined,
  UnlockOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  ColorPicker,
  Dropdown,
  InputNumber,
  Popconfirm,
  Radio,
  Slider,
  Tag,
  Tooltip,
} from 'antd'
import { useMemo, useState } from 'react'
import { analyzeSelectedCellDetails } from '../processing'
import type { CellOverride, CellResult, ColorRule, GridSize } from '../types'

interface ToolPanelProps {
  gridSize: GridSize
  rule: ColorRule
  selectedCell: { row: number; column: number } | null
  cellOverride?: CellOverride
  selectedCellResult?: CellResult | null
  cells: CellResult[][] | null
  image: HTMLImageElement | null
  imageData: ImageData | null
  modifiedCount: number
  isDetecting: boolean
  onGridSizeChange: (size: GridSize) => void
  onRuleChange: (rule: ColorRule) => void
  onCellOverride: (
    row: number,
    col: number,
    override: CellOverride | null,
  ) => void
  onClearAllOverrides: () => void
  onAutoDetect: () => void
}

export function ToolPanel({
  gridSize,
  rule,
  selectedCell,
  cellOverride,
  selectedCellResult,
  cells,
  image,
  imageData,
  modifiedCount,
  isDetecting,
  onGridSizeChange,
  onRuleChange,
  onCellOverride,
  onClearAllOverrides,
  onAutoDetect,
}: ToolPanelProps) {
  // 默认锁定原图宽高比
  const [lockAspect, setLockAspect] = useState(true)

  // 原始图片宽高比
  const imgAspect = useMemo(() => {
    if (!image) return 1
    const w = image.naturalWidth || image.width || 1
    const h = image.naturalHeight || image.height || 1
    return w / h
  }, [image])

  // 处理列数修改
  const handleColumnsChange = (val: number | null) => {
    if (val === null) return
    const cols = Math.max(1, Math.min(200, Math.round(val)))
    if (lockAspect) {
      const rows = Math.max(1, Math.min(200, Math.round(cols / imgAspect)))
      onGridSizeChange({ columns: cols, rows })
    } else {
      onGridSizeChange({ columns: cols, rows: gridSize.rows })
    }
  }

  // 处理行数修改
  const handleRowsChange = (val: number | null) => {
    if (val === null) return
    const rows = Math.max(1, Math.min(200, Math.round(val)))
    if (lockAspect) {
      const cols = Math.max(1, Math.min(200, Math.round(rows * imgAspect)))
      onGridSizeChange({ columns: cols, rows })
    } else {
      onGridSizeChange({ columns: gridSize.columns, rows })
    }
  }

  // 快捷预设尺寸（长边按预设规格，若开启比例锁定则短边自动等比缩放）
  const handleApplyPreset = (targetSize: number) => {
    if (lockAspect) {
      if (imgAspect >= 1) {
        const cols = targetSize
        const rows = Math.max(
          1,
          Math.min(200, Math.round(targetSize / imgAspect)),
        )
        onGridSizeChange({ columns: cols, rows })
      } else {
        const rows = targetSize
        const cols = Math.max(
          1,
          Math.min(200, Math.round(targetSize * imgAspect)),
        )
        onGridSizeChange({ columns: cols, rows })
      }
    } else {
      onGridSizeChange({ columns: targetSize, rows: targetSize })
    }
  }

  // 统计全图豆子颜色用量
  const beadStats = useMemo(() => {
    if (!cells || cells.length === 0) return []
    const map = new Map<string, number>()
    for (const row of cells) {
      for (const cell of row) {
        map.set(cell.color, (map.get(cell.color) || 0) + 1)
      }
    }
    const list = Array.from(map.entries()).map(([color, count]) => ({
      color,
      count,
    }))
    list.sort((a, b) => b.count - a.count)
    return list
  }, [cells])

  // 按需精确分析当前选中格的颜色分布（仅在选中格时计算，不阻碍全图流畅性）
  const selectedCellSourceColors = useMemo(() => {
    if (!selectedCell || !imageData) return []
    return analyzeSelectedCellDetails(
      imageData,
      selectedCell.row,
      selectedCell.column,
      gridSize,
    )
  }, [imageData, selectedCell, gridSize])

  // 导出完美像素图为 PNG（无网格线，纯净点阵图）
  const handleExportPNG = (scaleType: 'hd' | '1to1' = 'hd') => {
    if (!cells || cells.length === 0) return
    const cols = gridSize.columns
    const rows = gridSize.rows
    const scale =
      scaleType === '1to1'
        ? 1
        : Math.max(1, Math.floor(1200 / Math.max(cols, rows)))

    const canvas = document.createElement('canvas')
    canvas.width = cols * scale
    canvas.height = rows * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 禁用抗锯齿，保证完美锐利的像素方块
    ctx.imageSmoothingEnabled = false

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = cells[r]?.[c]
        ctx.fillStyle = cell ? cell.color : '#FFFFFF'
        ctx.fillRect(c * scale, r * scale, scale, scale)
      }
    }

    const link = document.createElement('a')
    link.download =
      scaleType === '1to1'
        ? `像素图_1to1_${cols}x${rows}.png`
        : `像素图_高清_${cols}x${rows}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  // 导出豆子用量清单为 TXT
  const handleExportStats = () => {
    if (beadStats.length === 0) return
    const totalBeads = beadStats.reduce((sum, item) => sum + item.count, 0)
    let text = `拼豆颜色用量清单\n`
    text += `网格规格：${gridSize.columns} 列 × ${gridSize.rows} 行（共 ${totalBeads} 颗）\n`
    text += `颜色种类：共 ${beadStats.length} 种颜色\n`
    text += `----------------------------------------\n`
    beadStats.forEach((item, idx) => {
      const pct = ((item.count / totalBeads) * 100).toFixed(1)
      text += `${idx + 1}. 色号 ${item.color} : ${item.count} 颗 (${pct}%)\n`
    })

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const link = document.createElement('a')
    link.download = `拼豆用量清单_${gridSize.columns}x${gridSize.rows}.txt`
    link.href = URL.createObjectURL(blob)
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="flex h-full w-full flex-col space-y-4 overflow-y-auto p-4 select-none">
      {/* 1. 网格规格与识别 */}
      <Card
        size="small"
        title={<span className="text-sm font-semibold">网格尺寸与配置</span>}
        extra={
          <Button
            type="link"
            size="small"
            icon={<ScanOutlined />}
            loading={isDetecting}
            onClick={onAutoDetect}
          >
            自动识别
          </Button>
        }
        className="shadow-2xs dark:border-slate-800 dark:bg-slate-900/60"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="mb-1 text-xs text-slate-500">列数 (宽)</div>
              <InputNumber
                min={1}
                max={200}
                value={gridSize.columns}
                onChange={handleColumnsChange}
                className="w-full"
              />
            </div>

            <Tooltip title={lockAspect ? '解除比例锁定' : '锁定原图长宽比'}>
              <Button
                type={lockAspect ? 'primary' : 'default'}
                size="small"
                icon={lockAspect ? <LockOutlined /> : <UnlockOutlined />}
                onClick={() => setLockAspect((v) => !v)}
                className="mt-4"
              />
            </Tooltip>

            <div className="flex-1">
              <div className="mb-1 text-xs text-slate-500">行数 (高)</div>
              <InputNumber
                min={1}
                max={200}
                value={gridSize.rows}
                onChange={handleRowsChange}
                className="w-full"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs text-slate-400">
              常用拼豆规格预设：
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: '29 小板', size: 29 },
                { label: '50 标准', size: 50 },
                { label: '58 大板', size: 58 },
                { label: '80', size: 80 },
              ].map((p) => (
                <Tag
                  key={p.label}
                  className="cursor-pointer hover:border-orange-400"
                  onClick={() => handleApplyPreset(p.size)}
                >
                  {p.label}
                </Tag>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* 2. 全局取色规则 */}
      <Card
        size="small"
        title={<span className="text-sm font-semibold">全局取色规则</span>}
        className="shadow-2xs dark:border-slate-800 dark:bg-slate-900/60"
      >
        <Radio.Group
          value={rule.type}
          onChange={(e) => {
            const nextType = e.target.value
            if (nextType === 'dominant') {
              onRuleChange({ type: 'dominant' })
            } else {
              onRuleChange({ type: 'center', offsetX: 0, offsetY: 0 })
            }
          }}
          className="flex flex-col gap-2"
        >
          <Radio value="dominant">
            <div>
              <div className="text-xs font-medium">主色占比（推荐）</div>
              <div className="text-[11px] text-slate-400">
                统计单元格内主导颜色并聚合微小色差，适合 AI 生成图
              </div>
            </div>
          </Radio>

          <Radio value="center">
            <div>
              <div className="text-xs font-medium">中心像素采样</div>
              <div className="text-[11px] text-slate-400">
                严格获取单元中心点像素，可微调 X / Y 偏移（极速 60FPS 实时响应）
              </div>
            </div>
          </Radio>
        </Radio.Group>

        {rule.type === 'center' && (
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>X 轴偏移</span>
                <span>{Math.round((rule.offsetX || 0) * 100)}%</span>
              </div>
              <Slider
                min={-1}
                max={1}
                step={0.05}
                value={rule.offsetX || 0}
                onChange={(v) =>
                  onRuleChange({
                    type: 'center',
                    offsetX: v,
                    offsetY: rule.offsetY || 0,
                  })
                }
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Y 轴偏移</span>
                <span>{Math.round((rule.offsetY || 0) * 100)}%</span>
              </div>
              <Slider
                min={-1}
                max={1}
                step={0.05}
                value={rule.offsetY || 0}
                onChange={(v) =>
                  onRuleChange({
                    type: 'center',
                    offsetX: rule.offsetX || 0,
                    offsetY: v,
                  })
                }
              />
            </div>
          </div>
        )}
      </Card>

      {/* 3. 单格编辑 */}
      <Card
        size="small"
        title={
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">单格编辑</span>
            {selectedCell && (
              <span className="text-xs text-orange-500">
                第 {selectedCell.row + 1} 行，第 {selectedCell.column + 1} 列
              </span>
            )}
          </div>
        }
        className="shadow-2xs dark:border-slate-800 dark:bg-slate-900/60"
      >
        {selectedCell && selectedCellResult ? (
          <div className="space-y-3">
            {/* 当前颜色与选择器 */}
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-2 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <div
                  className="h-7 w-7 rounded-md border border-slate-300 shadow-2xs dark:border-slate-600"
                  style={{ backgroundColor: selectedCellResult.color }}
                />
                <div>
                  <div className="font-mono text-xs font-semibold">
                    {selectedCellResult.color}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {cellOverride?.color
                      ? '已手动指定'
                      : cellOverride?.rule
                        ? '已覆盖规则'
                        : '默认规则计算'}
                  </div>
                </div>
              </div>

              <ColorPicker
                value={selectedCellResult.color}
                onChange={(_, hex) => {
                  onCellOverride(selectedCell.row, selectedCell.column, {
                    color: hex.toUpperCase(),
                  })
                }}
              />
            </div>

            {/* 单元格原色分布列表 */}
            <div>
              <div className="mb-1.5 text-xs text-slate-500">
                单元原色分布（点击直接选用）：
              </div>
              <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {selectedCellSourceColors.map((item, idx) => (
                  <div
                    key={`${item.color}-${idx}`}
                    onClick={() => {
                      onCellOverride(selectedCell.row, selectedCell.column, {
                        color: item.color,
                      })
                    }}
                    className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1 transition-colors hover:bg-orange-50/60 dark:hover:bg-orange-950/20"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-4 w-4 rounded border border-black/10"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                        {item.color}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {Math.round(item.ratio * 100)}% ({item.count} 像素)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 单格快捷操作 */}
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-1 dark:border-slate-800">
              <Button
                size="small"
                onClick={() =>
                  onCellOverride(selectedCell.row, selectedCell.column, {
                    rule: { type: 'dominant' },
                  })
                }
              >
                设为主色
              </Button>
              <Button
                size="small"
                onClick={() =>
                  onCellOverride(selectedCell.row, selectedCell.column, {
                    rule: { type: 'center', offsetX: 0, offsetY: 0 },
                  })
                }
              >
                设为中心像素
              </Button>
              {cellOverride && (
                <Button
                  size="small"
                  danger
                  icon={<RedoOutlined />}
                  onClick={() =>
                    onCellOverride(selectedCell.row, selectedCell.column, null)
                  }
                >
                  清除单格覆盖
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="py-4 text-center text-xs text-slate-400">
            点击左侧网格预览中的任意单元格，即可在此编辑该格颜色或快速换色
          </div>
        )}
      </Card>

      {/* 4. 全局覆盖状态与清理 */}
      {modifiedCount > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50/50 p-2.5 dark:border-orange-900/40 dark:bg-orange-950/20">
          <span className="text-xs text-orange-700 dark:text-orange-400">
            已手动微调 {modifiedCount} 处单元格
          </span>
          <Popconfirm
            title="确认清除所有单格覆盖？"
            description="将恢复全图使用统一的全局取色规则。"
            onConfirm={onClearAllOverrides}
            okText="清除"
            cancelText="取消"
          >
            <Button size="small" danger type="link" icon={<ClearOutlined />}>
              清除全部覆盖
            </Button>
          </Popconfirm>
        </div>
      )}

      {/* 5. 豆子用量统计与导出 */}
      <Card
        size="small"
        title={<span className="text-sm font-semibold">拼豆用量清单</span>}
        extra={
          <span className="text-xs text-slate-400">
            共 {gridSize.columns * gridSize.rows} 颗
          </span>
        }
        className="shadow-2xs dark:border-slate-800 dark:bg-slate-900/60"
      >
        <div className="space-y-3">
          <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
            {beadStats.slice(0, 12).map((item) => (
              <div
                key={item.color}
                className="flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-3.5 w-3.5 rounded border border-black/10"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-mono text-slate-600 dark:text-slate-300">
                    {item.color}
                  </span>
                </div>
                <span className="font-medium text-slate-500">
                  {item.count} 颗
                </span>
              </div>
            ))}
            {beadStats.length > 12 && (
              <div className="text-center text-[11px] text-slate-400">
                ... 还有 {beadStats.length - 12} 种颜色，详见清单导出
              </div>
            )}
          </div>

          <div className="flex gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
            <Dropdown.Button
              type="primary"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => handleExportPNG('hd')}
              menu={{
                items: [
                  {
                    key: 'hd',
                    label: '导出高清像素图（无网格）',
                    onClick: () => handleExportPNG('hd'),
                  },
                  {
                    key: '1to1',
                    label: '导出 1:1 原始像素图（无网格，1像素/格）',
                    onClick: () => handleExportPNG('1to1'),
                  },
                ],
              }}
              className="flex-1"
            >
              导出像素图
            </Dropdown.Button>
            <Button size="small" onClick={handleExportStats} className="flex-1">
              导出用量清单
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
