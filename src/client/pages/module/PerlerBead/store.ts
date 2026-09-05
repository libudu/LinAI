import { create } from 'zustand'
import { getDefaultGridSize } from './processing'
import type {
  CellOverride,
  CellOverrideMap,
  ColorRule,
  GridSize,
} from './types'

interface PerlerBeadState {
  imageUrl: string | null
  imageElement: HTMLImageElement | null
  imageData: ImageData | null
  gridSize: GridSize
  globalRule: ColorRule
  cellOverrides: CellOverrideMap
  selectedCell: { row: number; column: number } | null
  isDetecting: boolean
  loadingImage: boolean

  // Actions
  setImage: (
    url: string,
    img: HTMLImageElement,
    data: ImageData,
    detectedGrid?: GridSize,
  ) => void
  setGridSize: (size: GridSize) => void
  setGlobalRule: (rule: ColorRule) => void
  setCellOverride: (
    row: number,
    col: number,
    override: CellOverride | null,
  ) => void
  clearAllOverrides: () => void
  setSelectedCell: (cell: { row: number; column: number } | null) => void
  setIsDetecting: (isDetecting: boolean) => void
  setLoadingImage: (loading: boolean) => void
  reset: () => void
}

export const usePerlerBeadStore = create<PerlerBeadState>((set, get) => ({
  imageUrl: null,
  imageElement: null,
  imageData: null,
  gridSize: { columns: 50, rows: 50 },
  globalRule: { type: 'dominant', offsetX: 0.5, offsetY: 0.5 },
  cellOverrides: {},
  selectedCell: null,
  isDetecting: false,
  loadingImage: false,

  setImage: (url, img, data, detectedGrid) => {
    const prevUrl = get().imageUrl
    if (prevUrl && prevUrl.startsWith('blob:') && prevUrl !== url) {
      setTimeout(() => {
        try {
          URL.revokeObjectURL(prevUrl)
        } catch (e) {
          console.warn('释放旧图片 Blob 失败', e)
        }
      }, 1000)
    }

    const initialGrid =
      detectedGrid ||
      getDefaultGridSize(
        img.naturalWidth || img.width,
        img.naturalHeight || img.height,
      )

    set({
      imageUrl: url,
      imageElement: img,
      imageData: data,
      gridSize: initialGrid,
      selectedCell: null,
      cellOverrides: {},
      loadingImage: false,
    })
  },

  setGridSize: (size) => {
    const { cellOverrides, selectedCell } = get()
    const nextOverrides: CellOverrideMap = {}
    for (const [key, val] of Object.entries(cellOverrides)) {
      const [rStr, cStr] = key.split(',')
      const r = parseInt(rStr, 10)
      const c = parseInt(cStr, 10)
      if (r < size.rows && c < size.columns) {
        nextOverrides[key] = val
      }
    }

    let nextSelected = selectedCell
    if (
      selectedCell &&
      (selectedCell.row >= size.rows || selectedCell.column >= size.columns)
    ) {
      nextSelected = null
    }

    set({
      gridSize: size,
      cellOverrides: nextOverrides,
      selectedCell: nextSelected,
    })
  },

  setGlobalRule: (rule) => set({ globalRule: rule }),

  setCellOverride: (row, col, override) => {
    const key = `${row},${col}`
    const nextOverrides = { ...get().cellOverrides }
    if (override === null) {
      delete nextOverrides[key]
    } else {
      nextOverrides[key] = override
    }
    set({ cellOverrides: nextOverrides })
  },

  clearAllOverrides: () => set({ cellOverrides: {} }),

  setSelectedCell: (cell) => set({ selectedCell: cell }),

  setIsDetecting: (isDetecting) => set({ isDetecting }),

  setLoadingImage: (loadingImage) => set({ loadingImage }),

  reset: () => {
    const prevUrl = get().imageUrl
    if (prevUrl && prevUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(prevUrl)
      } catch (e) {
        console.warn('释放图片 Blob 失败', e)
      }
    }

    set({
      imageUrl: null,
      imageElement: null,
      imageData: null,
      gridSize: { columns: 50, rows: 50 },
      globalRule: { type: 'dominant', offsetX: 0.5, offsetY: 0.5 },
      cellOverrides: {},
      selectedCell: null,
      isDetecting: false,
      loadingImage: false,
    })
  },
}))
