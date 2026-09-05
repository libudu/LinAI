import { message, Spin } from 'antd'
import { useCallback, useMemo } from 'react'
import { GridPreview } from './components/GridPreview'
import { ImageSource } from './components/ImageSource'
import { ToolPanel } from './components/ToolPanel'
import {
  computeAllCells,
  detectGridSize,
  getDefaultGridSize,
  getImageDataFromImage,
  loadImage,
} from './processing'
import { usePerlerBeadStore } from './store'
import type { CellOverride, CellResult } from './types'

export function PerlerBead() {
  const {
    imageUrl,
    imageElement,
    imageData,
    loadingImage,
    gridSize,
    isDetecting,
    globalRule,
    cellOverrides,
    selectedCell,
    setImage,
    setGridSize,
    setGlobalRule,
    setCellOverride,
    clearAllOverrides,
    setSelectedCell,
    setIsDetecting,
    setLoadingImage,
    reset,
  } = usePerlerBeadStore()

  // 处理图片选择与自动网格识别
  const handleSelectImage = useCallback(
    async (newUrl: string) => {
      setLoadingImage(true)
      try {
        const img = await loadImage(newUrl)
        // 提取原图 ImageData（限制最大尺寸 1200，保证像素统计精度的同时杜绝巨图引发 OOM）
        const { imageData: imgData } = getImageDataFromImage(img, 1200)

        // 默认按原图长宽比等比缩放，长边为 50
        const defaultGrid = getDefaultGridSize(
          img.naturalWidth || img.width,
          img.naturalHeight || img.height,
        )

        setImage(newUrl, img, imgData, defaultGrid)
        message.success(
          `已载入图片，默认应用长边 50 等比网格：${defaultGrid.columns} × ${defaultGrid.rows}`,
        )
      } catch (err) {
        console.error('加载处理图片失败', err)
        message.error(err instanceof Error ? err.message : '加载图片失败')
        reset()
      } finally {
        setLoadingImage(false)
      }
    },
    [setImage, setLoadingImage, reset],
  )

  // 手动点击重新识别网格
  const handleManualAutoDetect = useCallback(() => {
    if (!imageElement) return
    setIsDetecting(true)
    try {
      const autoResult = detectGridSize(imageElement)
      setGridSize(autoResult.gridSize)
      if (autoResult.confidence >= 0.45) {
        message.success(
          `识别完成：${autoResult.gridSize.columns} × ${autoResult.gridSize.rows} (置信度 ${Math.round(autoResult.confidence * 100)}%)`,
        )
      } else {
        message.info(
          `未检测到明显网格特征，建议手动指定行列数，已重置为：${autoResult.gridSize.columns} × ${autoResult.gridSize.rows}`,
        )
      }
    } catch (err) {
      console.error('自动识别失败', err)
      message.error('自动识别网格失败')
    } finally {
      setIsDetecting(false)
    }
  }, [imageElement, setIsDetecting, setGridSize])

  // 单格覆盖更新
  const handleCellOverride = useCallback(
    (row: number, col: number, override: CellOverride | null) => {
      setCellOverride(row, col, override)
    },
    [setCellOverride],
  )

  // 清除全部单格覆盖
  const handleClearAllOverrides = useCallback(() => {
    clearAllOverrides()
    message.success('已清除全部单格覆盖，恢复全局规则')
  }, [clearAllOverrides])

  // 高性能计算拼豆处理结果（带缓存）
  const cells: CellResult[][] | null = useMemo(() => {
    if (!imageData) return null
    return computeAllCells(imageData, gridSize, globalRule, cellOverrides)
  }, [imageData, gridSize, globalRule, cellOverrides])

  // 当前选中单元格的结果
  const selectedCellResult = useMemo(() => {
    if (!cells || !selectedCell) return null
    return cells[selectedCell.row]?.[selectedCell.column] || null
  }, [cells, selectedCell])

  // 单格覆盖数量
  const modifiedCount = useMemo(() => {
    return Object.keys(cellOverrides).length
  }, [cellOverrides])

  // 当前选中单元格的覆盖配置
  const currentCellOverride = useMemo(() => {
    if (!selectedCell) return undefined
    return cellOverrides[`${selectedCell.row},${selectedCell.column}`]
  }, [cellOverrides, selectedCell])

  // 如果没有选择图片，展示欢迎与导入页面
  if (!imageUrl) {
    return (
      <div className="flex h-[calc(100dvh-61px)] w-full items-center justify-center overflow-hidden bg-slate-50 md:h-dvh dark:bg-slate-950">
        <ImageSource onSelectImage={handleSelectImage} />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100dvh-61px)] w-full flex-col overflow-hidden bg-slate-50 md:h-dvh dark:bg-slate-950">
      {/* 顶部轻量工具栏 */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            拼豆图处理
          </span>
          {imageElement && (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              原图 {imageElement.naturalWidth} × {imageElement.naturalHeight}
            </span>
          )}
        </div>

        <ImageSource compact onSelectImage={handleSelectImage} />
      </div>

      {/* 主体三栏工作区 */}
      <div className="relative flex flex-1 flex-col overflow-hidden lg:flex-row">
        {loadingImage && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-xs dark:bg-slate-950/70">
            <Spin tip="正在处理图片与分析网格..." />
          </div>
        )}

        {/* 左栏：原图与网格对齐 */}
        <div className="min-h-[300px] flex-1 overflow-hidden p-3 lg:min-h-0">
          <GridPreview
            mode="source"
            image={imageElement}
            grid={gridSize}
            cells={cells}
            selectedCell={selectedCell}
            onSelectCell={setSelectedCell}
            title="原图网格对照"
          />
        </div>

        {/* 中栏：拼豆效果预览 */}
        <div className="min-h-[300px] flex-1 overflow-hidden border-t border-slate-200 p-3 lg:min-h-0 lg:border-t-0 lg:border-l dark:border-slate-800">
          <GridPreview
            mode="result"
            image={imageElement}
            grid={gridSize}
            cells={cells}
            selectedCell={selectedCell}
            onSelectCell={setSelectedCell}
            title="拼豆成品效果"
          />
        </div>

        {/* 右栏：参数与工具控制面板 */}
        <div className="w-full shrink-0 border-t border-slate-200 bg-white lg:w-84 lg:border-t-0 lg:border-l xl:w-92 dark:border-slate-800 dark:bg-slate-900/50">
          <ToolPanel
            gridSize={gridSize}
            rule={globalRule}
            selectedCell={selectedCell}
            cellOverride={currentCellOverride}
            selectedCellResult={selectedCellResult}
            cells={cells}
            image={imageElement}
            imageData={imageData}
            modifiedCount={modifiedCount}
            isDetecting={isDetecting}
            onGridSizeChange={setGridSize}
            onRuleChange={setGlobalRule}
            onCellOverride={handleCellOverride}
            onClearAllOverrides={handleClearAllOverrides}
            onAutoDetect={handleManualAutoDetect}
          />
        </div>
      </div>
    </div>
  )
}
