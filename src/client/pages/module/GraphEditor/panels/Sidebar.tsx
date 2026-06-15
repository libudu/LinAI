import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  LeftOutlined,
  PictureOutlined,
  RightOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { Button, Input, message, Spin, Tabs } from 'antd'
import copy from 'copy-to-clipboard'
import { hc } from 'hono/client'
import type { DragEvent } from 'react'
import { useEffect, useState } from 'react'
import type { AppType } from '../../../../../server'
import type { TaskTemplate } from '../../../../../server/common/template-manager'
import type {
  GptImageQuality,
  GptImageSize,
} from '../../../../../server/module/gpt-image/enum'
import { GPT_IMAGE_SOURCE_MODEL } from '../../../../../server/module/gpt-image/enum'
import { useRecentImages } from '../../../../hooks/useRecentImages'
import { useTasks } from '../../../../hooks/useTasks'
import { useTemplates } from '../../../../hooks/useTemplates'
import { uid, useGraphEditorStore } from '../store'
import type {
  DragPayload,
  GraphNode,
  GraphNodeData,
  ImageNodeData,
  InfoNodeData,
  SidebarTab,
  TaskNodeData,
} from '../types'

const client = hc<AppType>('/')

/* ─── Sidebar Props ─── */

interface SidebarProps {
  selectedNode: GraphNode<GraphNodeData> | null
  selectedImageUrls: string[]
  generateSize: GptImageSize
  generateQuality: GptImageQuality
  onGenerateSizeChange: (size: GptImageSize) => void
  onGenerateQualityChange: (quality: GptImageQuality) => void
  onGenerateImage: () => void
  onSaveTemplate: (infoData: InfoNodeData, imageUrl?: string) => void
  onDeleteNode: (id: string) => void
  onAddNode: (node: GraphNode<GraphNodeData>) => void
  onCloneNode: (id: string) => void
  onUpdateInfoNode: (id: string, updates: Partial<InfoNodeData>) => void
  edges: Array<{ source: string; target: string }>
  imageNodes: Array<{ id: string; data: ImageNodeData }>
  infoNodes: Array<{ id: string; data: InfoNodeData }>
  isInfoEditable: (nodeId: string, data: InfoNodeData) => boolean
}

/* ───────── Main Sidebar ───────── */

export function Sidebar(props: SidebarProps) {
  const { sidebarTab, setSidebarTab, sidebarOpen, setSidebarOpen } =
    useGraphEditorStore()

  if (!sidebarOpen) {
    return (
      <div className="flex items-center border-r border-slate-200 bg-white p-1">
        <Button
          type="text"
          size="small"
          icon={<RightOutlined />}
          onClick={() => setSidebarOpen(true)}
          title="展开侧栏"
        />
      </div>
    )
  }

  return (
    <div className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
      {/* Header + collapse */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-3">
        <span className="text-sm font-semibold text-slate-600">素材库</span>
        <Button
          type="text"
          size="small"
          icon={<LeftOutlined />}
          onClick={() => setSidebarOpen(false)}
          title="折叠侧栏"
        />
      </div>

      {/* Tabs */}
      <Tabs
        activeKey={sidebarTab}
        onChange={(k) => setSidebarTab(k as SidebarTab)}
        className="flex-shrink-0 [&_.ant-tabs-nav]:px-3"
        items={[
          {
            key: 'gallery',
            label: (
              <span className="text-xs">
                <PictureOutlined /> 图库
              </span>
            ),
            children: null,
          },
          {
            key: 'templates',
            label: (
              <span className="text-xs">
                <FolderOpenOutlined /> 模板
              </span>
            ),
            children: null,
          },
          {
            key: 'tasks',
            label: (
              <span className="text-xs">
                <FileTextOutlined /> 任务
              </span>
            ),
            children: null,
          },
        ]}
      />

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        {sidebarTab === 'gallery' && <GalleryTab />}
        {sidebarTab === 'templates' && <TemplatesTab />}
        {sidebarTab === 'tasks' && <TasksTab />}
      </div>

      {/* Node detail panel (merged inspector) */}
      {props.selectedNode ? (
        <NodeDetail
          node={props.selectedNode}
          selectedImageUrls={props.selectedImageUrls}
          generateSize={props.generateSize}
          generateQuality={props.generateQuality}
          onSizeChange={props.onGenerateSizeChange}
          onQualityChange={props.onGenerateQualityChange}
          onGenerate={props.onGenerateImage}
          onSaveTemplate={props.onSaveTemplate}
          onDelete={props.onDeleteNode}
          onClone={props.onCloneNode}
          onUpdateInfoNode={props.onUpdateInfoNode}
          isInfoEditable={props.isInfoEditable}
          edges={props.edges}
        />
      ) : (
        <div className="border-t border-slate-200 p-3">
          <Button
            type="dashed"
            size="small"
            block
            onClick={() => {
              const node: GraphNode<InfoNodeData> = {
                id: uid('info'),
                type: 'info',
                position: { x: 300, y: 200 },
                data: { kind: 'info', title: '新建信息', prompt: '' },
              }
              props.onAddNode(node)
            }}
          >
            + 新建信息节点
          </Button>
        </div>
      )}
    </div>
  )
}

/* ───────── Node Detail Panel ───────── */
interface NodeDetailProps {
  node: GraphNode<GraphNodeData>
  selectedImageUrls: string[]
  generateSize: GptImageSize
  generateQuality: GptImageQuality
  onSizeChange: (size: GptImageSize) => void
  onQualityChange: (quality: GptImageQuality) => void
  onGenerate: () => void
  onSaveTemplate: (infoData: InfoNodeData, imageUrl?: string) => void
  onDelete: (id: string) => void
  onClone: (id: string) => void
  onUpdateInfoNode: (id: string, updates: Partial<InfoNodeData>) => void
  isInfoEditable: (nodeId: string, data: InfoNodeData) => boolean
  edges: Array<{ source: string; target: string }>
}

function NodeDetail(props: NodeDetailProps) {
  const {
    node,
    selectedImageUrls,
    generateSize,
    generateQuality,
    onSizeChange,
    onQualityChange,
    onGenerate,
    onSaveTemplate,
    onDelete,
    onClone,
    onUpdateInfoNode,
    isInfoEditable,
  } = props
  const data = node.data

  switch (data.kind) {
    case 'info': {
      const editable = isInfoEditable(node.id, data)
      return (
        <InfoDetail
          data={data}
          nodeId={node.id}
          editable={editable}
          selectedImageUrls={selectedImageUrls}
          generateSize={generateSize}
          generateQuality={generateQuality}
          onSizeChange={onSizeChange}
          onQualityChange={onQualityChange}
          onGenerate={onGenerate}
          onSaveTemplate={() => onSaveTemplate(data, selectedImageUrls[0])}
          onDelete={() => onDelete(node.id)}
          onClone={() => onClone(node.id)}
          onUpdateInfoNode={onUpdateInfoNode}
        />
      )
    }
    case 'image':
      return <ImageDetail data={data} onDelete={() => onDelete(node.id)} />
    case 'task':
      return <TaskDetail data={data} onDelete={() => onDelete(node.id)} />
  }
}

/* ───────── Info detail ───────── */

function InfoDetail({
  data,
  nodeId,
  editable,
  selectedImageUrls,
  generateSize,
  generateQuality,
  onSizeChange,
  onQualityChange,
  onGenerate,
  onSaveTemplate,
  onDelete,
  onClone,
  onUpdateInfoNode,
}: {
  data: InfoNodeData
  nodeId: string
  editable: boolean
  selectedImageUrls: string[]
  generateSize: GptImageSize
  generateQuality: GptImageQuality
  onSizeChange: (size: GptImageSize) => void
  onQualityChange: (quality: GptImageQuality) => void
  onGenerate: () => void
  onSaveTemplate: () => void
  onDelete: () => void
  onClone: () => void
  onUpdateInfoNode: (id: string, updates: Partial<InfoNodeData>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(data.title || '')
  const [editPrompt, setEditPrompt] = useState(data.prompt)
  const [editRatio, setEditRatio] = useState(data.aspectRatio || '')

  const handleSaveEdit = () => {
    const updates: Partial<InfoNodeData> = {}
    if (editTitle !== (data.title || '')) updates.title = editTitle
    if (editPrompt !== data.prompt) updates.prompt = editPrompt
    if (editRatio !== (data.aspectRatio || ''))
      updates.aspectRatio = editRatio || undefined
    if (Object.keys(updates).length > 0) {
      onUpdateInfoNode(nodeId, updates)
      message.success('已更新')
    }
    setEditing(false)
  }

  return (
    <div className="space-y-3 border-t border-slate-200 p-3 text-xs">
      {/* View mode */}
      <div className={editing ? 'hidden' : ''}>
        <SectionTitle>📄 {data.title || '提示词信息'}</SectionTitle>

        <div>
          <Label text="提示词" />
          <div className="max-h-20 overflow-y-auto rounded bg-slate-50 p-1.5 text-xs whitespace-pre-wrap text-slate-600">
            {data.prompt}
          </div>
          <div className="flex gap-1">
            <Button
              type="link"
              size="small"
              className="px-0! text-[10px]!"
              icon={<CopyOutlined />}
              onClick={() => {
                copy(data.prompt)
                message.success('已复制')
              }}
            >
              复制
            </Button>
            {editable && (
              <Button
                type="link"
                size="small"
                className="px-0! text-[10px]!"
                icon={<EditOutlined />}
                onClick={() => setEditing(true)}
              >
                编辑
              </Button>
            )}
          </div>
        </div>

        <div>
          <Label text="比例" />
          <span className="text-slate-600">{data.aspectRatio || '未指定'}</span>
        </div>

        {selectedImageUrls.length > 0 && (
          <div>
            <Label text={`已选图片 (${selectedImageUrls.length})`} />
            <div className="flex flex-wrap gap-1">
              {selectedImageUrls.map((url, i) => (
                <div key={url} className="relative">
                  <img
                    src={`${url}${url.includes('?') ? '&' : '?'}thumb=true`}
                    alt=""
                    className="h-10 w-10 rounded border border-blue-300 object-cover"
                  />
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[8px] text-white">
                    {i + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label text="分辨率" />
          <div className="flex gap-1">
            {(['1k', '2k', '4k'] as const).map((s) => (
              <Button
                key={s}
                size="small"
                type={generateSize === s ? 'primary' : 'default'}
                onClick={() => onSizeChange(s)}
                className="text-xs!"
              >
                {s.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <Label text="质量" />
          <div className="flex gap-1">
            {(['medium', 'high'] as const).map((q) => (
              <Button
                key={q}
                size="small"
                type={generateQuality === q ? 'primary' : 'default'}
                onClick={() => onQualityChange(q)}
                className="text-xs!"
              >
                {q === 'medium' ? '标准' : '高清'}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button
            type="primary"
            size="small"
            icon={<SendOutlined />}
            onClick={onGenerate}
          >
            生成图片
          </Button>
          <Button size="small" icon={<SaveOutlined />} onClick={onSaveTemplate}>
            保存模板
          </Button>
          <Button size="small" onClick={onClone}>
            📋 复制
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={onDelete}
          >
            删除
          </Button>
        </div>
      </div>

      {/* Edit mode — kept in DOM, just hidden when not active */}
      <div className={editing ? '' : 'hidden'}>
        <SectionTitle>📄 编辑信息节点</SectionTitle>
        <div>
          <Label text="标题" />
          <Input
            size="small"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
        </div>
        <div>
          <Label text="提示词" />
          <textarea
            className="w-full rounded border border-slate-300 p-1.5 text-xs"
            rows={4}
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
          />
        </div>
        <div>
          <Label text="比例" />
          <Input
            size="small"
            value={editRatio}
            onChange={(e) => setEditRatio(e.target.value)}
            placeholder="3:4"
          />
        </div>
        <div className="flex gap-1.5 pt-1">
          <Button size="small" type="primary" onClick={handleSaveEdit}>
            保存
          </Button>
          <Button size="small" onClick={() => setEditing(false)}>
            取消
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ───────── Image detail ───────── */

function ImageDetail({
  data,
  onDelete,
}: {
  data: ImageNodeData
  onDelete: () => void
}) {
  return (
    <div className="space-y-3 border-t border-slate-200 p-3 text-xs">
      <SectionTitle>🖼️ 图片节点</SectionTitle>
      <img src={data.imageUrl} alt="" className="w-full rounded object-cover" />
      <div>
        <Label text="来源" />
        <span className="text-slate-600">
          {data.sourceType === 'gallery'
            ? '图库'
            : data.sourceType === 'template'
              ? '模板'
              : '生成任务'}
        </span>
      </div>
      <Button size="small" danger icon={<DeleteOutlined />} onClick={onDelete}>
        删除
      </Button>
    </div>
  )
}

/* ───────── Task detail ───────── */

function TaskDetail({
  data,
  onDelete,
}: {
  data: TaskNodeData
  onDelete: () => void
}) {
  return (
    <div className="space-y-3 border-t border-slate-200 p-3 text-xs">
      <SectionTitle>📝 任务节点</SectionTitle>
      <div>
        <Label text="状态" />
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
            data.status === 'completed'
              ? 'bg-green-100 text-green-700'
              : data.status === 'failed'
                ? 'bg-red-100 text-red-700'
                : data.status === 'running'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-100 text-slate-600'
          }`}
        >
          {data.status}
        </span>
      </div>
      {data.prompt && (
        <div>
          <Label text="提示词" />
          <div className="max-h-16 overflow-y-auto rounded bg-slate-50 p-1.5 text-xs whitespace-pre-wrap text-slate-600">
            {data.prompt}
          </div>
        </div>
      )}
      {data.error && (
        <div>
          <Label text="错误" />
          <span className="text-xs text-red-500">{data.error}</span>
        </div>
      )}
      <Button size="small" danger icon={<DeleteOutlined />} onClick={onDelete}>
        删除
      </Button>
    </div>
  )
}

/* ───────── Shared helpers ───────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 pb-1 text-sm font-semibold text-slate-700">
      {children}
    </div>
  )
}

function Label({ text }: { text: string }) {
  return (
    <div className="mb-0.5 text-[10px] text-slate-400 uppercase">{text}</div>
  )
}

/* ──── Tab: Gallery ──── */

type ImageItem = { url: string; type: 'input' | 'generated' }

function GalleryTab() {
  const [activeKey, setActiveKey] = useState('recent')
  const [images, setImages] = useState<ImageItem[]>([])
  const [loading, setLoading] = useState(false)
  const { recentImages } = useRecentImages()

  const doFetch = async () => {
    setLoading(true)
    try {
      const res = await client.api.static.images.list.$get()
      const d = await res.json()
      if (d.success) setImages((d.data as ImageItem[]) || [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    doFetch()
  }, [])

  const urls =
    activeKey === 'recent'
      ? recentImages
      : images.filter((img) => img.type === activeKey).map((img) => img.url)

  return (
    <div>
      <Tabs
        activeKey={activeKey}
        onChange={setActiveKey}
        size="small"
        className="mb-2"
        items={[
          { key: 'recent', label: '最近' },
          { key: 'input', label: '输入' },
          { key: 'generated', label: '生成' },
        ]}
      />
      {loading ? (
        <div className="py-4 text-center">
          <Spin size="small" />
        </div>
      ) : urls.length === 0 ? (
        <div className="py-4 text-center text-slate-400">暂无图片</div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {urls.map((url) => (
            <div
              key={url}
              draggable
              onDragStart={(e: DragEvent) => {
                e.dataTransfer.setData(
                  'application/linai-graph',
                  JSON.stringify({
                    kind: 'gallery-image',
                    data: { imageUrl: url },
                  } satisfies DragPayload),
                )
                e.dataTransfer.effectAllowed = 'move'
              }}
              className="aspect-square cursor-grab overflow-hidden rounded border border-slate-200 bg-slate-50 hover:border-blue-400 active:cursor-grabbing"
            >
              <img
                src={`${url}${url.includes('?') ? '&' : '?'}thumb=true`}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                draggable={false}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ──── Tab: Templates ──── */

function TemplatesTab() {
  const { data: templates, loading } = useTemplates()
  if (loading)
    return (
      <div className="flex justify-center p-4">
        <Spin size="small" />
      </div>
    )
  if (!templates?.length)
    return <div className="p-4 text-center text-slate-400">暂无模板</div>
  return (
    <div className="space-y-1.5">
      {templates.map((tpl: TaskTemplate) => (
        <div
          key={tpl.id}
          draggable
          onDragStart={(e: DragEvent) => {
            e.dataTransfer.setData(
              'application/linai-graph',
              JSON.stringify({
                kind: 'template',
                data: tpl,
              } satisfies DragPayload),
            )
            e.dataTransfer.effectAllowed = 'move'
          }}
          className="flex cursor-grab items-center gap-2 rounded border border-slate-200 bg-white p-2 text-xs hover:bg-slate-50 active:cursor-grabbing"
        >
          {tpl.images?.[0] ? (
            <img
              src={tpl.images[0]}
              alt=""
              className="h-8 w-8 shrink-0 rounded object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-300">
              <PictureOutlined />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-slate-700">
              {tpl.title || '未命名'}
            </div>
            <div className="truncate text-slate-400">{tpl.prompt}</div>
          </div>
          {tpl.aspectRatio && (
            <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">
              {tpl.aspectRatio}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/* ──── Tab: Tasks ──── */

interface TaskItem {
  id: string
  status: string
  outputUrls?: string[]
  outputUrl?: string
  rawTemplate?: { title?: string; prompt?: string }
  createdAt: number
  source: string
}

function TasksTab() {
  const { data: tasks, loading } = useTasks()
  const imageTasks: TaskItem[] = ((tasks as unknown as TaskItem[]) || [])
    .filter((t) => t.source === GPT_IMAGE_SOURCE_MODEL)
    .slice(0, 50)

  if (loading)
    return (
      <div className="flex justify-center p-4">
        <Spin size="small" />
      </div>
    )
  if (!imageTasks.length)
    return <div className="p-4 text-center text-slate-400">暂无任务</div>
  return (
    <div className="space-y-1.5">
      {imageTasks.map((t) => (
        <div
          key={t.id}
          draggable
          onDragStart={(e: DragEvent) => {
            e.dataTransfer.setData(
              'application/linai-graph',
              JSON.stringify({ kind: 'task', data: t } satisfies DragPayload),
            )
            e.dataTransfer.effectAllowed = 'move'
          }}
          className="flex cursor-grab items-center gap-2 rounded border border-slate-200 bg-white p-2 text-xs hover:bg-slate-50 active:cursor-grabbing"
        >
          {t.outputUrls?.[0] || t.outputUrl ? (
            <img
              src={t.outputUrls?.[0] || t.outputUrl!}
              alt=""
              className="h-8 w-8 shrink-0 rounded object-cover"
              draggable={false}
            />
          ) : (
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${t.status === 'completed' ? 'bg-green-100' : t.status === 'failed' ? 'bg-red-100' : 'bg-blue-100'}`}
            >
              {t.status === 'completed' ? (
                <span className="text-[10px] text-green-600">✓</span>
              ) : t.status === 'failed' ? (
                <span className="text-[10px] text-red-500">✗</span>
              ) : (
                <span className="text-[10px] text-blue-500">⋯</span>
              )}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-slate-700">
              {t.rawTemplate?.title || t.id.slice(0, 8)}
            </div>
            <div className="truncate text-slate-400">
              {t.rawTemplate?.prompt || ''}
            </div>
          </div>
          <span
            className={`shrink-0 rounded px-1 py-0.5 text-[10px] ${
              t.status === 'completed'
                ? 'bg-green-100 text-green-600'
                : t.status === 'running'
                  ? 'bg-blue-100 text-blue-600'
                  : t.status === 'failed'
                    ? 'bg-red-100 text-red-600'
                    : 'bg-slate-100 text-slate-500'
            }`}
          >
            {t.status === 'completed'
              ? '完成'
              : t.status === 'running'
                ? '运行中'
                : t.status === 'failed'
                  ? '失败'
                  : '等待'}
          </span>
        </div>
      ))}
    </div>
  )
}
