export interface GridSize {
  columns: number
  rows: number
}

export type ColorRule =
  | { type: 'center'; offsetX: number; offsetY: number }
  | { type: 'dominant'; maxColors?: number }

export interface CellColor {
  color: string // #RRGGBB
  count: number
  ratio: number // 0 ~ 1
}

export interface CellResult {
  row: number
  column: number
  color: string
  sourceColors: CellColor[]
}

export interface CellOverride {
  color?: string
  rule?: ColorRule
}

export type CellOverrideMap = Record<string, CellOverride>

export interface AutoGridResult {
  gridSize: GridSize
  confidence: number
}
