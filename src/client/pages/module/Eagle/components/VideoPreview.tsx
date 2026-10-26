import type { EagleItem } from '@/shared/eagle/types'
import {
  CloseOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
  ScissorOutlined,
} from '@ant-design/icons'
import { Button, ConfigProvider, Modal, Segmented, Spin } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import ReactCrop from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { eagleFileUrl, eagleVideoContactSheetUrl } from '../api'
import {
  loadVideoPlaybackRate,
  loadVideoPreviewMode,
  persistVideoPlaybackRate,
  persistVideoPreviewMode,
  type EagleVideoPreviewMode,
} from '../preferences'
import { formatFileSize } from './formatFileSize'
import { MediaEditSaveButton } from './MediaEditSaveButton'
import { getRotationEditOperations, normalizeRotation } from './rotation'
import { useVideoCrop } from './useVideoCrop'
import { fullVideoCrop } from './videoCrop'
import { formatVideoDuration, VideoPlayer } from './VideoPlayer'

interface VideoPreviewProps {
  item:
    | (Pick<EagleItem, 'id' | 'name' | 'ext' | 'size' | 'contentVersion'> &
        Partial<Pick<EagleItem, 'width' | 'height' | 'mtime'>>)
    | null
  onClose: () => void
  allowOverwrite?: boolean
  allowContactSheet?: boolean
  /** 切换条目时可独立保持弹窗打开，item 为空时展示加载或失败状态。 */
  open?: boolean
  loading?: boolean
  /** 预览右下角的自定义操作。 */
  toolbarExtra?: ReactNode
  onBusyChange?: (busy: boolean) => void
}

/** 挂载即请求联系图，缺失时由接口生成；切换视频或关闭时卸载。 */
function VideoContactSheetPreview({
  item,
}: {
  item: NonNullable<VideoPreviewProps['item']>
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  return (
    <>
      <img
        key={attempt}
        src={`${eagleVideoContactSheetUrl(item.id)}?v=${item.contentVersion}&retry=${attempt}`}
        alt={`${item.name}.${item.ext} 的联系图`}
        className={`absolute inset-0 h-full w-full object-contain ${status === 'ready' ? '' : 'invisible'}`}
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('error')}
      />
      {status === 'loading' && (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-white"
        >
          <Spin size="large" />
          <span>正在加载或生成联系图…</span>
        </div>
      )}
      {status === 'error' && (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-white"
        >
          <span>联系图加载或生成失败</span>
          <Button
            onClick={() => {
              setStatus('loading')
              setAttempt((current) => current + 1)
            }}
          >
            重试
          </Button>
        </div>
      )}
    </>
  )
}

/** 视频沿用大图预览的黑色遮罩，记忆播放器/联系图模式，底部信息独立占用空间。 */
export function VideoPreview({
  item: inputItem,
  onClose,
  allowOverwrite = true,
  allowContactSheet = true,
  open = inputItem !== null,
  loading = false,
  toolbarExtra,
  onBusyChange,
}: VideoPreviewProps) {
  const inputKey = inputItem
    ? `${inputItem.id}:${inputItem.contentVersion}`
    : ''
  const [saved, setSaved] = useState<{
    inputKey: string
    item: NonNullable<VideoPreviewProps['item']>
  } | null>(null)
  const item = saved?.inputKey === inputKey ? saved.item : inputItem
  const [preferredMode, setMode] = useState(loadVideoPreviewMode)
  const mode = allowContactSheet ? preferredMode : 'video'
  const [playbackRate, setPlaybackRate] = useState(loadVideoPlaybackRate)
  const initializedVideoRef = useRef<HTMLVideoElement | null>(null)
  const [videoMetadata, setVideoMetadata] = useState<{
    key: string
    width: number
    height: number
    duration: number | null
  } | null>(null)
  const videoKey = item ? `${item.id}:${item.contentVersion}` : ''
  const metadata = videoMetadata?.key === videoKey ? videoMetadata : null
  const resolution =
    metadata && metadata.width > 0 && metadata.height > 0 ? metadata : item
  const duration = metadata?.duration ?? null
  const readVideoMetadata = (video: HTMLVideoElement) => {
    setVideoMetadata({
      key: videoKey,
      width: video.videoWidth,
      height: video.videoHeight,
      duration:
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : null,
    })
  }
  const [rotation, setRotation] = useState(0)
  const [saving, setSaving] = useState(false)
  const crop = useVideoCrop(initializedVideoRef, videoKey, rotation, open)
  const busy = saving || crop.active
  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])
  const busyCallbackRef = useRef(onBusyChange)
  busyCallbackRef.current = onBusyChange
  useEffect(() => () => busyCallbackRef.current?.(false), [])
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    setRotation(0)
  }, [videoKey, mode])
  useEffect(() => {
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [container])
  const sideways = rotation === 90 || rotation === 270
  const width = resolution?.width || containerSize.width
  const height = resolution?.height || containerSize.height
  const displayWidth = sideways ? height : width
  const displayHeight = sideways ? width : height
  // 对比例坐标钳制并截断，避免浮点误差使右/下边界越过 1。
  const cropX = Math.floor(Math.max(0, crop.crop.x) * 10_000) / 1_000_000
  const cropY = Math.floor(Math.max(0, crop.crop.y) * 10_000) / 1_000_000
  const cropWidth =
    Math.floor(Math.min(crop.crop.width / 100, 1 - cropX) * 1_000_000) /
    1_000_000
  const cropHeight =
    Math.floor(Math.min(crop.crop.height / 100, 1 - cropY) * 1_000_000) /
    1_000_000
  const hasCrop = cropX > 0 || cropY > 0 || cropWidth < 1 || cropHeight < 1
  const cropOperations =
    !crop.detecting &&
    hasCrop &&
    cropWidth * displayWidth >= 2 &&
    cropHeight * displayHeight >= 2
      ? [
          ...getRotationEditOperations(rotation),
          {
            type: 'crop' as const,
            x: cropX,
            y: cropY,
            width: cropWidth,
            height: cropHeight,
          },
        ]
      : []
  const scale =
    Math.min(
      containerSize.width / (sideways ? height : width),
      containerSize.height / (sideways ? width : height),
    ) || 1
  const close = () => {
    if (!saving) {
      crop.cancel()
      onClose()
    }
  }
  return (
    <Modal
      open={open}
      onCancel={close}
      keyboard={!saving}
      maskClosable={!saving}
      title={<span className="sr-only">视频预览</span>}
      footer={null}
      closable={false}
      destroyOnHidden
      width="100%"
      mask={{ blur: false }}
      style={{ top: 0, maxWidth: '100vw', margin: 0, paddingBottom: 0 }}
      styles={{
        mask: { background: 'rgba(0, 0, 0, 0.65)' },
        wrapper: { overflow: 'hidden' },
        container: {
          padding: 0,
          background: 'transparent',
          boxShadow: 'none',
          borderRadius: 0,
        },
        header: { height: 0, margin: 0, padding: 0, background: 'transparent' },
        body: { height: '100dvh', padding: 0 },
      }}
    >
      {item ? (
        <div
          className="relative flex h-full flex-col items-center gap-3 px-4 pt-14 pb-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <button
            type="button"
            aria-label="关闭视频预览"
            title="关闭视频预览"
            className="absolute top-3 right-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
            disabled={saving}
            onClick={close}
          >
            <CloseOutlined />
          </button>
          <div
            ref={setContainer}
            className="relative min-h-0 w-full flex-1 overflow-hidden"
            onClick={(event) => {
              if (event.target === event.currentTarget) close()
            }}
          >
            {mode === 'video' ? (
              <div
                className="absolute top-1/2 left-0 w-full -translate-y-1/2 bg-black/30"
                style={{ height: (sideways ? width : height) * scale }}
                onClick={(event) => event.stopPropagation()}
              >
                <VideoPlayer
                  key={videoKey}
                  src={eagleFileUrl(item.id, item.contentVersion)}
                  autoPlay
                  playsInline
                  interactionDisabled={crop.active || saving}
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget
                    video.defaultPlaybackRate = playbackRate
                    video.playbackRate = playbackRate
                    initializedVideoRef.current = video
                    readVideoMetadata(video)
                  }}
                  onDurationChange={(event) =>
                    readVideoMetadata(event.currentTarget)
                  }
                  onLoadedData={(event) => {
                    initializedVideoRef.current = event.currentTarget
                    readVideoMetadata(event.currentTarget)
                  }}
                  onPlaybackRateChange={(rate) => {
                    setPlaybackRate(rate)
                    persistVideoPlaybackRate(rate)
                  }}
                  className="absolute top-1/2 left-1/2 object-contain"
                  style={{
                    width: width * scale,
                    height: height * scale,
                    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                  }}
                />
                {crop.active && (
                  <div
                    className="absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
                    style={{
                      width: displayWidth * scale,
                      height: displayHeight * scale,
                    }}
                  >
                    <ReactCrop
                      crop={crop.crop}
                      keepSelection
                      ruleOfThirds
                      disabled={crop.detecting || saving}
                      minWidth={Math.max(2, 2 * scale)}
                      minHeight={Math.max(2, 2 * scale)}
                      onChange={(_, percentCrop) => crop.setCrop(percentCrop)}
                      ariaLabels={{
                        cropArea: '视频裁剪区域',
                        nwDragHandle: '左上裁剪控制点',
                        nDragHandle: '上方裁剪控制点',
                        neDragHandle: '右上裁剪控制点',
                        eDragHandle: '右侧裁剪控制点',
                        seDragHandle: '右下裁剪控制点',
                        sDragHandle: '下方裁剪控制点',
                        swDragHandle: '左下裁剪控制点',
                        wDragHandle: '左侧裁剪控制点',
                      }}
                    >
                      <div
                        style={{
                          width: displayWidth * scale,
                          height: displayHeight * scale,
                        }}
                      />
                    </ReactCrop>
                  </div>
                )}
              </div>
            ) : (
              <>
                <video
                  key={videoKey}
                  src={eagleFileUrl(item.id, item.contentVersion)}
                  preload="metadata"
                  className="hidden"
                  onLoadedMetadata={(event) =>
                    readVideoMetadata(event.currentTarget)
                  }
                  onDurationChange={(event) =>
                    readVideoMetadata(event.currentTarget)
                  }
                />
                <VideoContactSheetPreview key={videoKey} item={item} />
              </>
            )}
          </div>
          <div
            className="flex w-full shrink-0 -translate-x-10 flex-wrap items-center justify-center gap-3"
            onClick={(event) => {
              if (event.target === event.currentTarget) close()
            }}
          >
            {mode === 'video' && (
              <div
                className="relative flex h-14 shrink-0 items-center justify-center gap-3 rounded-full bg-black/40 px-4 py-2 text-white"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  title="向左旋转 90°"
                  aria-label="向左旋转 90°"
                  className="cursor-pointer p-2 text-xl disabled:cursor-wait disabled:opacity-50"
                  disabled={saving || crop.active}
                  onClick={() =>
                    setRotation((value) => normalizeRotation(value - 90))
                  }
                >
                  <RotateLeftOutlined />
                </button>
                <button
                  type="button"
                  title="向右旋转 90°"
                  aria-label="向右旋转 90°"
                  className="cursor-pointer p-2 text-xl disabled:cursor-wait disabled:opacity-50"
                  disabled={saving || crop.active}
                  onClick={() =>
                    setRotation((value) => normalizeRotation(value + 90))
                  }
                >
                  <RotateRightOutlined />
                </button>
                <button
                  type="button"
                  title="裁剪视频并另存"
                  aria-label="裁剪视频并另存"
                  aria-pressed={crop.active}
                  className="cursor-pointer p-2 text-xl disabled:cursor-wait disabled:opacity-50"
                  disabled={
                    saving ||
                    crop.active ||
                    crop.detecting ||
                    !metadata ||
                    !allowOverwrite
                  }
                  onClick={() => void crop.begin()}
                >
                  <ScissorOutlined />
                </button>
                {allowOverwrite && !crop.active && (
                  <div className="absolute top-1/2 right-full mr-3 -translate-y-1/2">
                    <MediaEditSaveButton
                      key={item.id}
                      id={item.id}
                      contentVersion={item.contentVersion}
                      operations={getRotationEditOperations(rotation)}
                      video
                      onBusyChange={(busy) => {
                        setSaving(busy)
                        if (busy) initializedVideoRef.current?.pause()
                      }}
                      onSaved={(next) => {
                        setSaved({ inputKey, item: next })
                        setRotation(0)
                        setSaving(false)
                      }}
                    />
                  </div>
                )}
              </div>
            )}
            {crop.active && (
              <ConfigProvider
                theme={{
                  components: {
                    Button: {
                      colorBgContainerDisabled: '#e5e7eb',
                      colorTextDisabled: '#6b7280',
                      borderColorDisabled: '#d1d5db',
                    },
                  },
                }}
              >
                <div
                  className="flex flex-col items-center gap-2 rounded-lg bg-black/60 px-4 py-2 text-sm text-white"
                  onClick={(event) => event.stopPropagation()}
                >
                  {!saving && <span role="status">{crop.hint}</span>}
                  <div
                    className={saving ? 'w-full' : 'flex items-center gap-2'}
                  >
                    {!saving && (
                      <>
                        <Button onClick={crop.cancel}>取消裁剪</Button>
                        <Button
                          disabled={crop.detecting}
                          onClick={() => crop.setCrop(fullVideoCrop())}
                        >
                          还原
                        </Button>
                      </>
                    )}
                    <MediaEditSaveButton
                      key={`crop:${item.id}`}
                      id={item.id}
                      contentVersion={item.contentVersion}
                      operations={cropOperations}
                      video
                      saveAsCopy
                      inlineProgress
                      onBusyChange={setSaving}
                      onSaved={() => crop.cancel()}
                    />
                  </div>
                </div>
              </ConfigProvider>
            )}
            <div
              className="flex h-14 shrink-0 items-center rounded-full bg-black/40 px-2 py-2"
              onClick={(event) => event.stopPropagation()}
            >
              <ConfigProvider
                theme={{
                  components: {
                    Segmented: {
                      trackBg: 'transparent',
                      itemColor: 'rgba(255, 255, 255, 0.7)',
                      itemHoverColor: '#fff',
                      itemHoverBg: 'rgba(255, 255, 255, 0.12)',
                      itemSelectedBg: 'rgba(255, 255, 255, 0.2)',
                      itemSelectedColor: '#fff',
                    },
                  },
                }}
              >
                <Segmented<EagleVideoPreviewMode>
                  hidden={!allowContactSheet}
                  disabled={saving || crop.active}
                  size="large"
                  shape="round"
                  aria-label="视频预览方式"
                  value={mode}
                  options={[
                    { value: 'video', label: '视频' },
                    { value: 'contact-sheet', label: '联系图' },
                  ]}
                  onChange={(value) => {
                    setMode(value)
                    persistVideoPreviewMode(value)
                  }}
                />
              </ConfigProvider>
            </div>
            <div
              className="max-h-[20dvh] min-h-14 min-w-0 overflow-y-auto rounded-lg bg-black/40 px-3 py-2 text-center text-sm text-white"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="wrap-anywhere whitespace-pre-wrap">
                {item.name}.{item.ext}
              </div>
              <div className="text-white/70">
                {formatFileSize(item.size)}
                {resolution &&
                  (resolution.width ?? 0) > 0 &&
                  (resolution.height ?? 0) > 0 && (
                    <span className="ml-3">
                      {resolution.width} × {resolution.height}
                    </span>
                  )}
                {duration !== null && (
                  <span className="ml-3" title="视频时长">
                    {formatVideoDuration(duration)}
                  </span>
                )}
                {typeof item.mtime === 'number' &&
                  Number.isFinite(item.mtime) &&
                  item.mtime > 0 && (
                    <span className="ml-3 whitespace-nowrap" title="修改时间">
                      {dayjs(item.mtime).format('YYYY-MM-DD HH:mm:ss')}
                    </span>
                  )}
              </div>
            </div>
          </div>
          {toolbarExtra && (
            <div
              className="absolute right-6 bottom-7 z-10 flex items-center gap-2 rounded-full bg-black/40 px-4 py-2"
              onClick={(event) => event.stopPropagation()}
            >
              {toolbarExtra}
            </div>
          )}
        </div>
      ) : (
        <div
          className="flex h-full flex-col items-center justify-center gap-3 text-sm text-white"
          onClick={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <button
            type="button"
            aria-label="关闭视频预览"
            title="关闭视频预览"
            className="absolute top-3 right-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
            onClick={close}
          >
            <CloseOutlined />
          </button>
          {loading && <Spin size="large" />}
          <span role={loading ? 'status' : 'alert'}>
            {loading ? '正在加载视频信息…' : '视频信息加载失败'}
          </span>
        </div>
      )}
    </Modal>
  )
}
