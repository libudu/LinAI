import type { EagleItem } from '@/shared/eagle/types'
import { CloseOutlined } from '@ant-design/icons'
import { Button, Modal, Segmented, Spin } from 'antd'
import { useState } from 'react'
import { eagleFileUrl, eagleVideoContactSheetUrl } from '../api'
import {
  loadVideoPreviewMode,
  persistVideoPreviewMode,
  type EagleVideoPreviewMode,
} from '../preferences'
import { formatFileSize } from './formatFileSize'

interface VideoPreviewProps {
  item: EagleItem | null
  onClose: () => void
}

/** 挂载即请求联系图，缺失时由接口生成；切换视频或关闭时卸载。 */
function VideoContactSheetPreview({ item }: { item: EagleItem }) {
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
export function VideoPreview({ item, onClose }: VideoPreviewProps) {
  const [mode, setMode] = useState(loadVideoPreviewMode)

  return (
    <Modal
      open={item !== null}
      onCancel={onClose}
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
      {item && (
        <div
          className="flex h-full flex-col items-center gap-3 px-4 pt-14 pb-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose()
          }}
        >
          <button
            type="button"
            aria-label="关闭视频预览"
            title="关闭视频预览"
            className="absolute top-3 right-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
            onClick={onClose}
          >
            <CloseOutlined />
          </button>
          <div className="relative min-h-0 w-full flex-1">
            {mode === 'video' ? (
              <video
                key={`${item.id}:${item.contentVersion}`}
                src={eagleFileUrl(item.id, item.contentVersion)}
                controls
                autoPlay
                playsInline
                className="absolute inset-0 h-full w-full object-contain"
              />
            ) : (
              <VideoContactSheetPreview
                key={`${item.id}:${item.contentVersion}`}
                item={item}
              />
            )}
          </div>
          <div className="max-h-[20dvh] max-w-full shrink-0 overflow-y-auto rounded-lg bg-black/40 px-3 py-2 text-center text-sm text-white">
            <div className="wrap-anywhere whitespace-pre-wrap">
              {item.name}.{item.ext}
            </div>
            <div className="mt-1 text-white/70">
              {formatFileSize(item.size)}
            </div>
          </div>
          <Segmented<EagleVideoPreviewMode>
            className="shrink-0"
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
        </div>
      )}
    </Modal>
  )
}
