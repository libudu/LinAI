import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CanvasState, GraphEdge, SidebarTab } from './types'

const STORAGE_PREFIX = 'linai_canvas_'

interface GraphEditorStore {
  sidebarOpen: boolean
  sidebarTab: SidebarTab
  setSidebarOpen: (open: boolean) => void
  setSidebarTab: (tab: SidebarTab) => void
}

export const useGraphEditorStore = create<GraphEditorStore>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarTab: 'gallery' as SidebarTab,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarTab: (tab) => set({ sidebarTab: tab }),
    }),
    { name: 'linai_graph_editor' },
  ),
)

/* ───────── helpers ───────── */

function getCanvasKey(name: string): string {
  return `${STORAGE_PREFIX}${name}`
}

export function saveCanvas(state: CanvasState, name?: string): void {
  const key = getCanvasKey(name ?? 'default')
  localStorage.setItem(key, JSON.stringify(state))
}

export function loadCanvas(name?: string): CanvasState | null {
  const key = getCanvasKey(name ?? 'default')
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as CanvasState
  } catch {
    return null
  }
}

export function getRelatedNodeIds(
  nodeId: string,
  edges: GraphEdge[],
): string[] {
  const result = new Set<string>()
  for (const e of edges) {
    if (e.source === nodeId) result.add(e.target)
    if (e.target === nodeId) result.add(e.source)
  }
  return [...result]
}

let _counter = 0
export function uid(prefix = 'node'): string {
  return `${prefix}_${Date.now()}_${++_counter}`
}
