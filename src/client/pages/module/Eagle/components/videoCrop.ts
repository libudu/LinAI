import type { PercentCrop } from 'react-image-crop'

export const fullVideoCrop = (): PercentCrop => ({
  unit: '%',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
})

/** 独立加载采样视频的元数据，不改变可见播放器的 src 或播放位置。 */
const loadSampleVideo = (
  video: HTMLVideoElement,
  source: string,
  signal: AbortSignal,
) => {
  signal.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener('loadedmetadata', ready)
      video.removeEventListener('error', failed)
      signal.removeEventListener('abort', aborted)
    }
    const ready = () => {
      cleanup()
      resolve()
    }
    const failed = () => {
      cleanup()
      reject(new Error('视频采样加载失败，可手动调整裁剪区域'))
    }
    const aborted = () => {
      cleanup()
      reject(signal.reason)
    }
    const timer = setTimeout(failed, 10_000)
    video.addEventListener('loadedmetadata', ready)
    video.addEventListener('error', failed)
    signal.addEventListener('abort', aborted, { once: true })
    try {
      video.src = source
      video.load()
    } catch {
      failed()
    }
  })
}

const seekFrame = (
  video: HTMLVideoElement,
  time: number,
  signal: AbortSignal,
) => {
  signal.throwIfAborted()
  if (
    !video.seeking &&
    Math.abs(video.currentTime - time) < 0.01 &&
    video.readyState >= 2
  )
    return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener('seeked', ready)
      video.removeEventListener('loadeddata', ready)
      video.removeEventListener('error', failed)
      signal.removeEventListener('abort', aborted)
    }
    const ready = () => {
      if (video.seeking || video.readyState < 2) return
      cleanup()
      resolve()
    }
    const failed = () => {
      cleanup()
      reject(new Error('视频采样失败，可手动调整裁剪区域'))
    }
    const aborted = () => {
      cleanup()
      reject(signal.reason)
    }
    const timer = setTimeout(failed, 5000)
    video.addEventListener('seeked', ready)
    video.addEventListener('loadeddata', ready)
    video.addEventListener('error', failed)
    signal.addEventListener('abort', aborted, { once: true })
    try {
      video.currentTime = time
    } catch {
      failed()
    }
  })
}

/** 沿用脚本的 RGB 16 阈值与每行/列 0.05% 噪点容差，只取样本共有的成对黑边。 */
export const detectBufferedVideoCrop = async (
  video: HTMLVideoElement,
  rotation: number,
  signal: AbortSignal,
) => {
  signal.throwIfAborted()
  const originalTime = video.currentTime
  const source = video.currentSrc
  const sideways = rotation === 90 || rotation === 270
  const width = sideways ? video.videoHeight : video.videoWidth
  const height = sideways ? video.videoWidth : video.videoHeight
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context || width < 2 || height < 2)
    throw new Error('无法读取视频画面，可手动调整裁剪区域')
  const times = new Set([originalTime])
  // 最多检查附近已缓冲片段中的五帧，不 seek 到尚未缓冲的远处。
  for (let i = 0; i < video.buffered.length; i++) {
    if (
      video.buffered.start(i) > originalTime ||
      video.buffered.end(i) <= originalTime
    )
      continue
    const start = Math.max(video.buffered.start(i) + 0.05, originalTime - 4)
    const end = Math.min(video.buffered.end(i) - 0.05, originalTime + 4)
    if (end > start)
      for (let n = 0; n < 4; n++) times.add(start + ((end - start) * n) / 3)
    break
  }
  let left = width
  let right = width
  let top = height
  let bottom = height
  let frames = 0
  let ambiguous = false
  // 使用相同 URL 复用浏览器缓存；仅隐藏元素执行 seek，可见画面始终停在原处。
  const sampler = document.createElement('video')
  sampler.hidden = true
  sampler.muted = true
  sampler.playsInline = true
  sampler.preload = 'metadata'
  if (video.crossOrigin !== null) sampler.crossOrigin = video.crossOrigin
  try {
    document.body.appendChild(sampler)
    await loadSampleVideo(sampler, source, signal)
    for (const time of times) {
      await seekFrame(sampler, time, signal)
      signal.throwIfAborted()
      if (
        sampler.videoWidth !== (sideways ? height : width) ||
        sampler.videoHeight !== (sideways ? width : height)
      )
        throw new Error('视频采样尺寸发生变化，请手动调整裁剪区域')
      context.save()
      context.translate(width / 2, height / 2)
      context.rotate((rotation * Math.PI) / 180)
      context.drawImage(
        sampler,
        -sampler.videoWidth / 2,
        -sampler.videoHeight / 2,
        sampler.videoWidth,
        sampler.videoHeight,
      )
      context.restore()
      const { data } = context.getImageData(0, 0, width, height)
      const rows = new Uint32Array(height)
      const columns = new Uint32Array(width)
      let contentPixels = 0
      for (let y = 0, p = 0; y < height; y++) {
        for (let x = 0; x < width; x++, p += 4) {
          if (data[p] > 16 || data[p + 1] > 16 || data[p + 2] > 16) {
            rows[y]++
            columns[x]++
            contentPixels++
          }
        }
      }
      frames++
      if (contentPixels < (width * height) / 100) {
        ambiguous = true
        break
      }
      let t = 0
      let b = 0
      let l = 0
      let r = 0
      const rowNoise = Math.floor(width / 2000)
      const columnNoise = Math.floor(height / 2000)
      while (t < height && rows[t] <= rowNoise) t++
      while (b < height && rows[height - b - 1] <= rowNoise) b++
      while (l < width && columns[l] <= columnNoise) l++
      while (r < width && columns[width - r - 1] <= columnNoise) r++
      top = Math.min(top, t)
      bottom = Math.min(bottom, b)
      left = Math.min(left, l)
      right = Math.min(right, r)
    }
    if (ambiguous) return { crop: fullVideoCrop(), frames, ambiguous }
    if (!left || !right) left = right = 0
    if (!top || !bottom) top = bottom = 0
    if (width - left - right < 2 || height - top - bottom < 2)
      return { crop: fullVideoCrop(), frames, ambiguous: true }
    return {
      crop: {
        unit: '%' as const,
        x: (left / width) * 100,
        y: (top / height) * 100,
        width: ((width - left - right) / width) * 100,
        height: ((height - top - bottom) / height) * 100,
      },
      frames,
      ambiguous,
    }
  } finally {
    // 完成、失败或取消都释放隐藏解码器及其网络请求，无需恢复可见播放器。
    sampler.pause()
    sampler.removeAttribute('src')
    sampler.load()
    sampler.remove()
    canvas.width = canvas.height = 0
  }
}
