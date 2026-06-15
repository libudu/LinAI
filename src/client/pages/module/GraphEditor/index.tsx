import {
  applyEdgeChanges,
  applyNodeChanges,
  FlowView,
  SelectType,
  type EdgeChange,
  type NodeChange,
} from '@ant-design/pro-flow'
import { message } from 'antd'
import { hc } from 'hono/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppType } from '../../../../server'
import type { TaskTemplate } from '../../../../server/common/template-manager'
import type {
  GptImageQuality,
  GptImageSize,
} from '../../../../server/module/gpt-image/enum'
import { useTasks } from '../../../hooks/useTasks'
import { ImageNode } from './nodes/ImageNode'
import { InfoNode } from './nodes/InfoNode'
import { TaskNode } from './nodes/TaskNode'
import { Sidebar } from './panels/Sidebar'
import { getRelatedNodeIds, loadCanvas, saveCanvas, uid } from './store'
import type {
  DragPayload,
  GraphEdge,
  GraphNode,
  GraphNodeData,
  ImageNodeData,
  InfoNodeData,
  TaskNodeData,
} from './types'
import { ViewportController, viewportRef } from './ViewportController'

const client = hc<AppType>('/')

const nodeTypes = {
  image: ImageNode,
  info: InfoNode,
  task: TaskNode,
}

function getNodeImageUrl(n: GraphNode<GraphNodeData>): string | undefined {
  if (n.data.kind === 'image') return (n.data as ImageNodeData).imageUrl
  if (n.data.kind === 'task') return (n.data as TaskNodeData).outputUrls[0]
}

function isSelectableImageNode(n: GraphNode<GraphNodeData>): boolean {
  return (
    n.data.kind === 'image' ||
    (n.data.kind === 'task' && (n.data as TaskNodeData).outputUrls.length > 0)
  )
}

export default function GraphEditor() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [nodes, setNodes] = useState<GraphNode<GraphNodeData>[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const { data: tasks } = useTasks()
  const [selectedNode, setSelectedNode] =
    useState<GraphNode<GraphNodeData> | null>(null)
  const [canvasName] = useState('default')
  const [saved, setSaved] = useState(true)

  const [generateSize, setGenerateSize] = useState<GptImageSize>('1k')
  const [generateQuality, setGenerateQuality] =
    useState<GptImageQuality>('medium')
  const [selectedImageOrder, setSelectedImageOrder] = useState<string[]>([])
  const [savedViewport, setSavedViewport] = useState<{
    x: number
    y: number
    zoom: number
  } | null>(null)

  // ─── Load canvas ───
  useEffect(() => {
    const state = loadCanvas(canvasName)
    if (state) {
      setNodes(state.nodes)
      setEdges(state.edges)
      if (state.viewport) setSavedViewport(state.viewport)
    }
  }, [canvasName])

  useEffect(() => {
    setSaved(false)
  }, [nodes, edges])

  const handleSave = useCallback(() => {
    const realEdges = edges.filter((e) => e.className !== 'visual-guide')
    saveCanvas(
      { nodes, edges: realEdges, viewport: viewportRef.current ?? undefined },
      canvasName,
    )
    setSaved(true)
    message.success('画布已保存')
  }, [nodes, edges, canvasName])

  // ─── FlowView ───
  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes(
        (nds) => applyNodeChanges(changes, nds) as GraphNode<GraphNodeData>[],
      ),
    [],
  )
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  )

  // ─── Highlight ───
  const highlightRelated = useCallback(
    (nodeId: string) => {
      const related = getRelatedNodeIds(nodeId, edges)
      const s = new Set(related)
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId) return { ...n, select: SelectType.SELECT }
          if (s.has(n.id)) return { ...n, select: SelectType.SUB_SELECT }
          const { select: _d, ...rest } = n
          return rest
        }),
      )
      setEdges((eds) =>
        eds.map((e) => {
          const r = e.source === nodeId || e.target === nodeId
          return {
            ...e,
            animated: r || undefined,
            ...(r ? { select: SelectType.SELECT } : {}),
          }
        }),
      )
    },
    [edges],
  )

  const clearHighlights = useCallback(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const { select: _d, ...r } = n
        return { ...r, style: { ...r.style, opacity: 1 } }
      }),
    )
    setEdges((eds) =>
      eds
        .filter((e) => e.className !== 'visual-guide')
        .map((e) => ({ ...e, animated: undefined, select: undefined })),
    )
  }, [])

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: GraphNode<GraphNodeData>) => {
      const shiftOnImage = event.shiftKey && isSelectableImageNode(node)
      if (!shiftOnImage) setSelectedNode(node)
      highlightRelated(node.id)
      if (shiftOnImage && selectedNode?.data.kind === 'info') {
        setSelectedImageOrder((prev) => {
          const idx = prev.indexOf(node.id)
          return idx >= 0
            ? prev.filter((id) => id !== node.id)
            : [...prev, node.id]
        })
      } else if (!event.shiftKey && node.data.kind !== 'info') {
        setSelectedImageOrder([])
      }
    },
    [edges, selectedNode, highlightRelated],
  )

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
    setSelectedImageOrder([])
    clearHighlights()
  }, [clearHighlights])
  // ─── Sync selection order + dim non-selected + guide edges ───
  useEffect(() => {
    const infoNodeId =
      selectedNode?.data.kind === 'info' ? selectedNode.id : null
    const hasSelection = infoNodeId && selectedImageOrder.length > 0
    setNodes((nds) =>
      nds.map((n) => {
        const orderIdx = selectedImageOrder.indexOf(n.id)
        const selectionOrder = orderIdx >= 0 ? orderIdx + 1 : undefined
        if (!hasSelection) {
          const { select: _d, ...r } = n
          const prevData = n.data as unknown as Record<string, unknown>
          return {
            ...r,
            style: { ...r.style, opacity: 1 },
            data: { ...prevData, selectionOrder },
          } as unknown as GraphNode<GraphNodeData>
        }
        if (n.id === infoNodeId || orderIdx >= 0) {
          return {
            ...n,
            select: SelectType.SELECT,
            style: { ...n.style, opacity: 1 },
            data: { ...n.data, selectionOrder } as GraphNodeData,
          }
        }
        const { select: _s, ...restN } = n
        return {
          ...restN,
          style: { ...restN.style, opacity: 0.3 },
          data: { ...n.data, selectionOrder } as GraphNodeData,
        }
      }),
    )
    if (hasSelection) {
      setEdges((eds) => {
        const real = eds.filter((e) => e.className !== 'visual-guide')
        const guides = selectedImageOrder.map((targetId) => ({
          id: `guide-${infoNodeId}-${targetId}`,
          source: infoNodeId,
          target: targetId,
          animated: true,
          className: 'visual-guide',
          style: {
            strokeDasharray: '5 5',
            stroke: '#1677ff',
            strokeWidth: 2,
          } as React.CSSProperties,
        }))
        return [...real, ...guides]
      })
    } else {
      setEdges((eds) => eds.filter((e) => e.className !== 'visual-guide'))
    }
  }, [selectedImageOrder, selectedNode])

  // ─── Drag & drop ───
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const findExistingInfoNode = useCallback(
    (prompt: string): GraphNode<InfoNodeData> | undefined =>
      nodes.find(
        (n): n is GraphNode<InfoNodeData> =>
          n.data.kind === 'info' && n.data.prompt === prompt,
      ),
    [nodes],
  )

  // ─── Shared: add a task node ───
  const addTaskNode = useCallback(
    (
      src: {
        id: string
        status: string
        outputUrls?: string[]
        outputUrl?: string
        rawTemplate?: { title?: string; prompt?: string }
        createdAt?: number
      },
      pos: { x: number; y: number },
      opts?: { linkToInfo?: boolean; infoNodeId?: string; isPending?: boolean },
    ) => {
      const canvasId = uid('task')
      const rawTmpl = src.rawTemplate
      setNodes((nds) => [
        ...nds,
        {
          id: canvasId,
          type: 'task',
          position: pos,
          data: {
            kind: 'task',
            taskId: opts?.isPending ? 'pending' : src.id,
            status: src.status,
            outputUrls:
              src.outputUrls ?? (src.outputUrl ? [src.outputUrl] : []),
            title: rawTmpl?.title,
            prompt: rawTmpl?.prompt,
            createdAt: src.createdAt ?? Date.now(),
          } as TaskNodeData,
        },
      ])
      const targetInfoId = opts?.infoNodeId
      if (targetInfoId) {
        setEdges((eds) => [
          ...eds,
          { id: uid('edge'), source: targetInfoId, target: canvasId },
        ])
        return canvasId
      }
      const prompt = rawTmpl?.prompt
      if (opts?.linkToInfo && prompt) {
        const existing = findExistingInfoNode(prompt)
        if (existing) {
          setEdges((eds) => [
            ...eds,
            { id: uid('edge'), source: existing.id, target: canvasId },
          ])
        } else {
          const infoId = uid('info')
          setNodes((nds) => [
            ...nds,
            {
              id: infoId,
              type: 'info',
              position: { x: pos.x - 200, y: pos.y },
              data: {
                kind: 'info',
                title: rawTmpl?.title,
                prompt,
                taskId: src.id,
              } as InfoNodeData,
            },
          ])
          setEdges((eds) => [
            ...eds,
            { id: uid('edge'), source: infoId, target: canvasId },
          ])
        }
      }
      return canvasId
    },
    [findExistingInfoNode],
  )

  const updateTaskNode = useCallback(
    (canvasId: string, updates: Partial<TaskNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === canvasId && n.data.kind === 'task'
            ? {
                ...n,
                data: {
                  ...(n.data as TaskNodeData),
                  ...updates,
                } as TaskNodeData,
              }
            : n,
        ),
      )
    },
    [],
  )

  // ─── onDrop ───
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const raw = event.dataTransfer.getData('application/linai-graph')
      if (!raw) return
      const payload: DragPayload = JSON.parse(raw)
      const pos = { x: event.clientX - 200, y: event.clientY - 100 }

      switch (payload.kind) {
        case 'gallery-image': {
          const img = payload.data as { imageUrl: string }
          setNodes((nds) => [
            ...nds,
            {
              id: uid('img'),
              type: 'image',
              position: pos,
              data: {
                kind: 'image',
                imageUrl: img.imageUrl,
                sourceType: 'gallery',
              } as ImageNodeData,
            },
          ])
          break
        }
        case 'template': {
          const tpl = payload.data as unknown as TaskTemplate
          const imageUrl = tpl.images?.[0]
          const existing = findExistingInfoNode(tpl.prompt)
          if (existing) {
            if (imageUrl) {
              const imgId = uid('img')
              setNodes((nds) => [
                ...nds,
                {
                  id: imgId,
                  type: 'image',
                  position: pos,
                  data: {
                    kind: 'image',
                    imageUrl,
                    sourceType: 'template',
                    sourceId: tpl.id,
                    aspectRatio: tpl.aspectRatio,
                  } as ImageNodeData,
                },
              ])
              setEdges((eds) => [
                ...eds,
                { id: uid('edge'), source: existing.id, target: imgId },
              ])
            }
          } else {
            const infoId = uid('info')
            setNodes((nds) => [
              ...nds,
              {
                id: infoId,
                type: 'info',
                position: { x: pos.x + 180, y: pos.y },
                data: {
                  kind: 'info',
                  title: tpl.title,
                  prompt: tpl.prompt,
                  aspectRatio: tpl.aspectRatio,
                  templateId: tpl.id,
                } as InfoNodeData,
              },
            ])
            if (imageUrl) {
              const imgId = uid('img')
              setNodes((nds) => [
                ...nds,
                {
                  id: imgId,
                  type: 'image',
                  position: pos,
                  data: {
                    kind: 'image',
                    imageUrl,
                    sourceType: 'template',
                    sourceId: tpl.id,
                    aspectRatio: tpl.aspectRatio,
                  } as ImageNodeData,
                },
              ])
              setEdges((eds) => [
                ...eds,
                { id: uid('edge'), source: infoId, target: imgId },
              ])
            }
          }
          break
        }
        case 'task': {
          const t = payload.data as {
            id: string
            status: string
            outputUrls?: string[]
            outputUrl?: string
            rawTemplate?: { title?: string; prompt?: string }
            createdAt: number
          }
          addTaskNode(t, pos, { linkToInfo: true })
          break
        }
      }
    },
    [findExistingInfoNode, addTaskNode],
  )

  // ─── Generate image ───
  const handleGenerateImage = useCallback(async () => {
    if (!selectedNode || selectedNode.data.kind !== 'info') {
      message.warning('请先选择一个信息节点')
      return
    }
    const infoData = selectedNode.data as InfoNodeData
    if (!infoData.prompt.trim()) {
      message.warning('提示词不能为空，请先编辑信息节点')
      return
    }
    const orderedImages = selectedImageOrder
      .map((id) => {
        const n = nodes.find((nd) => nd.id === id)
        return n ? getNodeImageUrl(n) : undefined
      })
      .filter((url): url is string => Boolean(url))
    const infoPos = selectedNode.position
    const sourceId = selectedNode.id
    const selectedIds = [...selectedImageOrder]

    // Clear selection + connect images (immediately)
    setSelectedImageOrder([])
    clearHighlights()
    setSelectedNode(null)
    const imageEdges = selectedIds.map((imgId) => ({
      id: uid('edge'),
      source: sourceId,
      target: imgId,
    }))
    setEdges((eds) => [...eds, ...imageEdges])

    // Add pending task node (immediately)
    const tempTaskId = addTaskNode(
      {
        id: '',
        status: 'pending',
        outputUrls: [],
        rawTemplate: {
          title: infoData.title || '画板任务',
          prompt: infoData.prompt,
        },
      },
      { x: infoPos.x + 300, y: infoPos.y },
      { infoNodeId: sourceId, isPending: true },
    )

    try {
      const res = await client.api.gptImage.trial.$post({
        json: {
          prompt: infoData.prompt,
          aspectRatio: infoData.aspectRatio ?? '1:1',
          images: orderedImages,
          size: generateSize,
          quality: generateQuality,
          n: 1,
        },
      })
      const body = await res.json()
      if (!body.success) {
        updateTaskNode(tempTaskId, {
          status: 'failed',
          error: body.error || '生成失败',
        })
        message.error(body.error || '生成失败')
        return
      }
      updateTaskNode(tempTaskId, { taskId: body.taskId, status: 'running' })
      message.success('生成任务已创建')
    } catch (err: unknown) {
      updateTaskNode(tempTaskId, { status: 'failed', error: '请求失败' })
      message.error(
        `生成请求失败: ${err instanceof Error ? err.message : '未知错误'}`,
      )
    }
  }, [
    selectedNode,
    selectedImageOrder,
    nodes,
    generateSize,
    generateQuality,
    addTaskNode,
    updateTaskNode,
    clearHighlights,
  ])

  // ─── Sync task status from SSE ───
  useEffect(() => {
    if (!tasks?.length) return
    setNodes((nds) =>
      nds.map((n) => {
        if (n.data.kind !== 'task') return n
        const td = n.data as TaskNodeData
        const live = (tasks as Array<Record<string, unknown>>).find(
          (t: any) => (t as Record<string, unknown>).id === td.taskId,
        )
        if (!live || live.status === td.status) return n
        return {
          ...n,
          data: {
            ...td,
            status: live.status as string,
            outputUrls:
              (live.outputUrls as string[]) ??
              (live.outputUrl ? [live.outputUrl as string] : td.outputUrls),
            error: (live.error as string) || undefined,
          } as TaskNodeData,
        } as GraphNode<TaskNodeData>
      }),
    )
  }, [tasks])

  const handleSaveTemplate = useCallback(
    async (infoData: InfoNodeData, imageUrl?: string) => {
      try {
        const res = await client.api.template.$post({
          json: {
            title: infoData.title ?? '画板保存的模板',
            prompt: infoData.prompt,
            aspectRatio: infoData.aspectRatio ?? '3:4',
            usageType: 'image' as const,
            images: imageUrl ? [imageUrl] : [],
          },
        })
        const body = await res.json()
        message.success(body.success ? '模板已保存' : body.error || '保存失败')
      } catch (err: unknown) {
        message.error(
          `保存失败: ${err instanceof Error ? err.message : '未知错误'}`,
        )
      }
    },
    [],
  )

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    setEdges((eds) =>
      eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
    )
    setSelectedNode((prev) => (prev?.id === nodeId ? null : prev))
    setSelectedImageOrder((prev) => prev.filter((id) => id !== nodeId))
  }, [])

  const handleAddNode = useCallback((node: GraphNode<GraphNodeData>) => {
    setNodes((nds) => [...nds, node])
    setSelectedNode(node)
  }, [])

  const handleCloneNode = useCallback(
    (nodeId: string) => {
      const src = nodes.find((n) => n.id === nodeId)
      if (!src || src.data.kind !== 'info') return
      const srcData = src.data as InfoNodeData
      const fork: GraphNode<InfoNodeData> = {
        id: uid('info'),
        type: 'info',
        position: { x: src.position.x + 50, y: src.position.y + 50 },
        data: {
          kind: 'info',
          title: srcData.title,
          prompt: srcData.prompt,
          aspectRatio: srcData.aspectRatio,
        },
      }
      setNodes((nds) => [...nds, fork])
      setSelectedNode(fork)
    },
    [nodes],
  )

  const handleUpdateInfoNode = useCallback(
    (nodeId: string, updates: Partial<InfoNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId || n.data.kind !== 'info') return n
          return {
            ...n,
            data: { ...(n.data as InfoNodeData), ...updates } as InfoNodeData,
          }
        }),
      )
    },
    [],
  )

  const imageNodes = useMemo(
    () =>
      nodes.filter(
        (n): n is GraphNode<ImageNodeData> => n.data.kind === 'image',
      ),
    [nodes],
  )
  const infoNodes = useMemo(
    () =>
      nodes.filter((n): n is GraphNode<InfoNodeData> => n.data.kind === 'info'),
    [nodes],
  )
  const selectedImageUrls = useMemo(
    () =>
      selectedImageOrder
        .map((id) => {
          const n = nodes.find((nd) => nd.id === id)
          return n ? getNodeImageUrl(n) : undefined
        })
        .filter((url): url is string => Boolean(url)),
    [selectedImageOrder, nodes],
  )

  const isInfoEditable = useCallback(
    (infoNodeId: string, infoData: InfoNodeData): boolean => {
      if (infoData.templateId) return false
      return !edges.some(
        (e) =>
          e.source === infoNodeId &&
          nodes.find((n) => n.id === e.target)?.data.kind === 'task',
      )
    },
    [edges, nodes],
  )

  return (
    <div
      className="fixed right-0 left-0 flex overflow-hidden"
      style={{ top: '57px', bottom: 0 }}
    >
      <Sidebar
        selectedNode={selectedNode}
        selectedImageUrls={selectedImageUrls}
        generateSize={generateSize}
        generateQuality={generateQuality}
        onGenerateSizeChange={setGenerateSize}
        onGenerateQualityChange={setGenerateQuality}
        onGenerateImage={handleGenerateImage}
        onSaveTemplate={handleSaveTemplate}
        onDeleteNode={handleDeleteNode}
        onAddNode={handleAddNode}
        onCloneNode={handleCloneNode}
        onUpdateInfoNode={handleUpdateInfoNode}
        edges={edges}
        imageNodes={imageNodes}
        infoNodes={infoNodes}
        isInfoEditable={isInfoEditable}
      />
      <div
        ref={reactFlowWrapper}
        className="flex-1"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <FlowView
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          miniMap
          background
          autoLayout={false}
          className="h-full w-full"
          flowProps={{
            onMoveEnd: (_event, viewport) => {
              viewportRef.current = viewport
            },
          }}
        >
          <ViewportController restore={savedViewport} />
        </FlowView>
      </div>
      <div className="fixed right-4 bottom-4 z-20">
        <button
          onClick={handleSave}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm transition-colors ${
            saved
              ? 'bg-slate-100 text-slate-500'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {saved ? '✓ 已保存' : '保存画布'}
        </button>
      </div>
    </div>
  )
}
