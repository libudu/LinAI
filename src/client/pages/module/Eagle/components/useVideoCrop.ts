import { message } from 'antd'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { PercentCrop } from 'react-image-crop'
import { detectBufferedVideoCrop, fullVideoCrop } from './videoCrop'

export const useVideoCrop = (
  videoRef: RefObject<HTMLVideoElement | null>,
  videoKey: string,
  rotation: number,
  open: boolean,
) => {
  const [active, setActive] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [crop, setCrop] = useState<PercentCrop>(fullVideoCrop)
  const [hint, setHint] = useState('')
  const controllerRef = useRef<AbortController | null>(null)
  useEffect(() => {
    setActive(false)
    setDetecting(false)
    return () => {
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [videoKey, open])
  const cancel = () => {
    controllerRef.current?.abort()
    setActive(false)
  }
  const begin = async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2) {
      message.info('请等待视频画面加载后再裁剪')
      return
    }
    if (controllerRef.current) return
    const controller = new AbortController()
    controllerRef.current = controller
    video.pause()
    setActive(true)
    setCrop(fullVideoCrop())
    setDetecting(true)
    setHint('正在检测已缓冲画面的共同黑边…')
    try {
      const result = await detectBufferedVideoCrop(
        video,
        rotation,
        controller.signal,
      )
      if (controller.signal.aborted) return
      setCrop(result.crop)
      const found = result.crop.width < 100 || result.crop.height < 100
      setHint(
        result.ambiguous
          ? '采样包含近乎全黑的画面，请手动调整裁剪框'
          : `已检测 ${result.frames} 帧${found ? '，可拖动调整裁剪框' : '，未发现共同成对黑边，可手动裁剪'}`,
      )
    } catch (error) {
      if (!controller.signal.aborted)
        setHint(error instanceof Error ? error.message : '检测失败，请手动裁剪')
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setDetecting(false)
      }
    }
  }
  return { active, detecting, crop, setCrop, hint, begin, cancel }
}
