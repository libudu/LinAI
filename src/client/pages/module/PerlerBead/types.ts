export interface GridSize {
  columns: number
  rows: number
}

export interface ColorRule {
  type: 'center' | 'dominant'
  offsetX: number // 0 ~ 1，默认 0.5，精度 0.01
  offsetY: number // 0 ~ 1，默认 0.5，精度 0.01
  maxColors?: number
}

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
