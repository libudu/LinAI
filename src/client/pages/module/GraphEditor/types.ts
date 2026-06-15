import type { SelectType } from '@ant-design/pro-flow'
import type { Task } from '../../../../server/common/task-manager'

/* ───────── Node Data Types ───────── */

export interface ImageNodeData {
  kind: 'image'
  imageUrl: string
  sourceType: 'gallery' | 'template' | 'task'
  sourceId?: string
  aspectRatio?: string
  selectionOrder?: number
}

export interface InfoNodeData {
  kind: 'info'
  prompt: string
  title?: string
  aspectRatio?: string
  templateId?: string
  taskId?: string
}

export interface TaskNodeData {
  kind: 'task'
  taskId: string
  status: Task['status']
  outputUrls: string[]
  prompt?: string
  title?: string
  error?: string
  createdAt: number
  selectionOrder?: number
}

export type GraphNodeData = ImageNodeData | InfoNodeData | TaskNodeData

/* ───────── Loose node/edge shapes for FlowView compat ───────── */

export interface GraphNode<T = Record<string, unknown>> {
  id: string
  type?: string
  position: { x: number; y: number }
  data: T
  select?: SelectType
  label?: string
  width?: number | null
  height?: number | null
  style?: React.CSSProperties
  className?: string
  draggable?: boolean
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  animated?: boolean
  select?: SelectType
  label?: React.ReactNode
  type?: string
  className?: string
}

/* ───────── Canvas persistence ───────── */

export interface CanvasState {
  nodes: GraphNode<GraphNodeData>[]
  edges: GraphEdge[]
  viewport?: { x: number; y: number; zoom: number }
}

/* ───────── Sidebar tabs ───────── */

export type SidebarTab = 'gallery' | 'templates' | 'tasks'

/* ───────── Drag payload ───────── */

export interface DragPayload {
  kind: 'gallery-image' | 'template' | 'task' | 'create-info'
  data: unknown
}
