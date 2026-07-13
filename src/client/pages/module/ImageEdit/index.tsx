import { DeleteOutlined, EditOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons'
import {
  Button,
  Input,
  Radio,
  Slider,
  Upload,
  message,
} from 'antd'
import type { UploadFile } from 'antd'
import { hc } from 'hono/client'
import { useRef, useState } from 'react'
import type { AppType } from '../../../../server'
import { useNavigate } from 'react-router-dom'

import {
  openGallery,
  type GalleryImageSelection,
} from '../../common/components/Gallery'
import { hasTransparentPixels, fetchImageAsBase64 } from '../../../utils/image'
import { useCanvasMask } from './useCanvasMask'
const client = hc<AppType>('/')

// ── Component ──────────────────────────────────────────────────

type MaskMode = 'brush' | 'upload'
type ImageStatus = 'loading' | 'ready' | 'error'

export function ImageEdit() {
  const [messageApi, contextHolder] = message.useMessage()

  // Source image
  const [imageStatus, setImageStatus] = useState<ImageStatus>('ready')
  const [hasAlpha, setHasAlpha] = useState(false)
  const [imageBase64, setImageBase64] = useState('')
  const [sourceDataUrl, setSourceDataUrl] = useState('')
  const imgRef = useRef<HTMLImageElement>(null)
  const navigate = useNavigate()
  const imgNaturalSize = useRef({ w: 0, h: 0 })

  // Mask
  const [maskMode, setMaskMode] = useState<MaskMode>('brush')
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null)
  const [uploadedMaskFile, setUploadedMaskFile] = useState<UploadFile | null>(null)

  const {
    canvasRef,
    brushSize,
    setBrushSize,
    resetCanvas,
    hasDrawn,
    handlers: canvasHandlers,
  } = useCanvasMask({
    hasAlpha,
    imageStatus,
    onMaskChange: (url) => setMaskDataUrl(url || null),
    maskMode,
    sourceDataUrl,
    imgRef,
  })
  const [sourceOpacity, setSourceOpacity] = useState(40)

  // Prompt
  const [prompt, setPrompt] = useState('')

  // Result
  const [loading, setLoading] = useState(false)

  // ── User uploads image ───────────────────────────────────────

  const handleUserUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setSourceDataUrl(dataUrl)
      setImageStatus('loading')
    }
    reader.readAsDataURL(file)
  }
  const handleGallerySelect = () => {
    openGallery({
      onSelect: (images: GalleryImageSelection[]) => {
        if (images.length === 0) return
        setSourceDataUrl(images[0].url)
        setImageStatus('loading')
      },
    })
  }

  // ── On source image loaded ───────────────────────────────────

  const handleImageLoaded = async () => {
    const img = imgRef.current
    if (!img || !sourceDataUrl) return
    imgNaturalSize.current = { w: img.naturalWidth, h: img.naturalHeight }

    const alpha = await hasTransparentPixels(img)
    setHasAlpha(alpha)

    try {
      const b64 = sourceDataUrl.startsWith('data:')
        ? sourceDataUrl
        : await fetchImageAsBase64(sourceDataUrl)
      setImageBase64(b64)
    } catch {
      setImageStatus('error')
      return
    }

    setImageStatus('ready')
  }



  // ── Mask upload ──────────────────────────────────────────────

  const handleMaskUpload = (file: UploadFile) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string

      if (!dataUrl.startsWith('data:image/png')) {
        messageApi.warning('仅支持 PNG 格式的蒙版图片')
        return
      }

      const maskImg = document.createElement('img')
      maskImg.onload = () => {
        const src = imgNaturalSize.current
        if (maskImg.naturalWidth !== src.w || maskImg.naturalHeight !== src.h) {
          messageApi.warning(`蒙版尺寸必须与原图一致（${src.w}×${src.h}）`)
          return
        }
        setMaskDataUrl(dataUrl)
        setUploadedMaskFile(file)
      }
      maskImg.src = dataUrl
    }
    reader.readAsDataURL((file as UploadFile & { originFileObj: File }).originFileObj || file as unknown as Blob)
    return false
  }

  const removeUploadedMask = () => {
    setMaskDataUrl(null)
    setUploadedMaskFile(null)
  }

  // ── Submit ───────────────────────────────────────────────────

  const handleEdit = async () => {
    if (!prompt.trim()) {
      messageApi.warning('请输入编辑提示词')
      return
    }
    if (!imageBase64) {
      messageApi.warning('图片未就绪')
      return
    }

    setLoading(true)
    try {
      const maskToSend =
        hasAlpha && maskDataUrl ? undefined
        : maskMode === 'upload' && maskDataUrl ? maskDataUrl
        : maskDataUrl && hasDrawn.current ? maskDataUrl
        : undefined

      type EditApi = {
        gptImage: {
          edit: {
            $post: (params: { json: { image: string; mask?: string; prompt: string } }) => Promise<{ json: () => Promise<{ success: boolean; error?: string; outputUrls?: string[] }> }>
          }
        }
      }
      const res = await (client.api as unknown as EditApi).gptImage.edit.$post({
        json: {
          image: imageBase64,
          mask: maskToSend,
          prompt: prompt.trim(),
        },
      })
      const data = await res.json()
      if (!data.success) {
        messageApi.error(data.error || '[服务] 编辑失败')
        setLoading(false)
        return
      }
      message.success('编辑成功，任务已加入列表')
      navigate('/')
    } catch (error: unknown) {
      messageApi.error(`[网络] ${error instanceof Error ? error.message : '请求失败'}`)
    } finally {
      setLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-6">
      {contextHolder}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <EditOutlined className="text-2xl text-blue-500" />
          <h2 className="m-0 text-xl font-semibold text-slate-800">图片编辑</h2>
        </div>
        {sourceDataUrl && (
          <Button size="small" onClick={() => { setSourceDataUrl(''); setImageStatus('ready'); setImageBase64(''); setMaskDataUrl(null); setHasAlpha(false); }}>
            更换图片
          </Button>
        )}
      </div>

      {!sourceDataUrl ? (
        <div className="py-8">
          <Upload.Dragger
            accept="image/png,image/jpeg,image/webp"
            showUploadList={false}
            beforeUpload={(file) => {
              handleUserUpload(file as File)
              return false
            }}
            className="!rounded !border-dashed"
          >
            <div className="flex flex-col items-center gap-2 py-8">
              <UploadOutlined className="text-4xl text-slate-300" />
              <span className="text-sm text-slate-500">
                点击或拖拽上传要编辑的图片
              </span>
              <span className="text-xs text-slate-400">
                支持 PNG / JPEG / WebP
              </span>
            </div>
          </Upload.Dragger>
          <div className="mt-4 flex justify-center">
            <Button
              icon={<PictureOutlined />}
              onClick={handleGallerySelect}
              size="large"
            >
              从图库中选图
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Hidden img for load detection */}
          <img
            ref={imgRef}
            src={sourceDataUrl}
            alt=""
            className="hidden"
            onLoad={handleImageLoaded}
            onError={() => setImageStatus('error')}
          />

          {imageStatus === 'loading' && (
            <div className="flex items-center justify-center py-16 text-slate-400">
              加载图片中...
            </div>
          )}

          {imageStatus === 'error' && (
            <div className="py-16 text-center text-red-500">图片加载失败</div>
          )}

          {imageStatus === 'ready' && (
            <div className="space-y-6">
              {/* ── Mask area ────────────────────────────────── */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">蒙版</span>
                  {hasAlpha && (
                    <span className="text-xs text-orange-500">
                      图片已含透明区域，将作为编辑蒙版
                    </span>
                  )}
                </div>

                {hasAlpha ? (
                  <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400">
                    无需蒙版，图片自带透明度
                  </div>
                ) : (
                  <>
                    <Radio.Group
                      value={maskMode}
                      onChange={(e) => setMaskMode(e.target.value)}
                      size="small"
                      className="mb-2"
                    >
                      <Radio.Button value="brush">画笔绘制</Radio.Button>
                      <Radio.Button value="upload">上传蒙版</Radio.Button>
                    </Radio.Group>

                    {maskMode === 'brush' && (
                      <div className="space-y-3">
                        {/* Source image on top of canvas as reference */}
                        <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                          <canvas
                            ref={canvasRef}
                            className="block w-full cursor-crosshair"
                            style={{ aspectRatio: `${imgNaturalSize.current.w} / ${imgNaturalSize.current.h}` }}
                            {...canvasHandlers}
                            role="img"
                            aria-label="蒙版编辑区域，使用画笔涂抹来标记需要编辑的区域"
                          />
                          <img
                            src={sourceDataUrl}
                            alt=""
                            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                            style={{ opacity: sourceOpacity / 100 }}
                          />
                          {maskDataUrl && (
                            <div className="absolute right-1 top-1 z-10 flex gap-1">
                              <Button size="small" icon={<DeleteOutlined />} onClick={resetCanvas} />
                            </div>
                          )}
                        </div>

                        {/* Brush size */}
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-400">画笔大小</span>
                          <Slider min={5} max={150} value={brushSize} onChange={setBrushSize} className="flex-1!" />
                          <span className="w-8 text-right text-xs text-slate-500">{brushSize}px</span>
                        </div>

                        {/* Source opacity — NEW */}
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-400">原图透明度</span>
                          <Slider min={0} max={100} value={sourceOpacity} onChange={setSourceOpacity} className="flex-1!" />
                          <span className="w-8 text-right text-xs text-slate-500">{sourceOpacity}%</span>
                        </div>
                      </div>
                    )}

                    {maskMode === 'upload' && (
                      <div className="flex flex-col gap-4 md:flex-row">
                        {/* Source image — moved here, only in upload mode */}
                        <div className="w-full shrink-0 md:w-[200px]">
                          <div className="mb-1 text-xs font-medium text-slate-500">原图</div>
                          <div className="overflow-hidden rounded-lg border border-slate-200">
                            <img
                              src={sourceDataUrl}
                              alt="source"
                              className="w-full object-contain"
                            />
                          </div>
                        </div>

                        {/* Mask upload */}
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 text-xs font-medium text-slate-500">上传蒙版</div>
                          {maskDataUrl && uploadedMaskFile ? (
                            <div className="relative inline-block rounded-lg border border-slate-200">
                              <img src={maskDataUrl} alt="mask" className="block max-h-[200px] object-contain" />
                              <Button size="small" danger icon={<DeleteOutlined />} className="absolute right-1 top-1" onClick={removeUploadedMask} />
                            </div>
                          ) : (
                            <Upload.Dragger accept=".png" showUploadList={false} beforeUpload={(file) => { handleMaskUpload({ originFileObj: file } as UploadFile); return false }} className="!rounded !border-dashed">
                              <div className="flex flex-col items-center gap-1 py-4">
                                <UploadOutlined className="text-2xl text-slate-300" />
                                <span className="text-xs text-slate-400">点击或拖拽上传蒙版 PNG</span>
                                <span className="text-xs text-slate-300">尺寸需与原图一致 ({imgNaturalSize.current.w}×{imgNaturalSize.current.h})</span>
                              </div>
                            </Upload.Dragger>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── Prompt ──────────────────────────────────── */}
              <div>
                <div className="mb-1 text-xs font-medium text-slate-500">编辑提示词</div>
                <Input.TextArea
                  placeholder="描述你想要的编辑效果，例如：把人物的头发改成红色..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={2}
                />
              </div>

              {/* ── Submit button ────────────────────────────── */}
              <div className="flex justify-end">
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  loading={loading}
                  disabled={!prompt.trim() || !sourceDataUrl}
                  onClick={handleEdit}
                  size="large"
                >
                  开始编辑
                </Button>
              </div>


            </div>
          )}
        </>
      )}
    </div>
  )
}
