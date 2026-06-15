import { useFlowViewer } from '@ant-design/pro-flow'
import { useEffect, useRef } from 'react'

export const viewportRef: {
  current: { x: number; y: number; zoom: number } | null
} = {
  current: null,
}

/**
 * Restores a saved viewport once on mount.
 * Viewport tracking happens via FlowView.flowProps.onMoveEnd in the parent.
 */
export function ViewportController({
  restore,
}: {
  restore: { x: number; y: number; zoom: number } | null
}) {
  const { setViewport } = useFlowViewer()
  const restored = useRef(false)

  useEffect(() => {
    if (restore && !restored.current) {
      restored.current = true
      requestAnimationFrame(() => setViewport(restore))
    }
  }, [restore, setViewport])

  return null
}
