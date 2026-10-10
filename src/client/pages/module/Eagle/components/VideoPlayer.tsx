import {
  PauseOutlined,
  PlayCircleOutlined,
  SoundOutlined,
} from '@ant-design/icons'
import { type ComponentProps, useRef, useState } from 'react'

type VideoPlayerProps = Omit<
  ComponentProps<'video'>,
  'controls' | 'onClick' | 'ref'
>

export function formatVideoDuration(time: number) {
  const seconds = Math.floor(Number.isFinite(time) ? Math.max(0, time) : 0)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const parts = [minutes, seconds % 60].map((part) =>
    String(part).padStart(2, '0'),
  )
  if (hours > 0) parts.unshift(String(hours))
  return parts.join(':')
}

/** 控件独立于视频元素，画面旋转不会影响播放操作。 */
export function VideoPlayer(props: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [controlsVisible, setControlsVisible] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const rates = [
    ...new Set([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4, playbackRate]),
  ].sort((a, b) => a - b)
  const togglePlayback = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play().catch(() => setPlaying(false))
    } else {
      video.pause()
    }
  }
  const seek = (time: number) => {
    const video = videoRef.current
    if (!video || duration <= 0) return
    video.currentTime = Math.min(duration, Math.max(0, time))
    setCurrentTime(video.currentTime)
  }

  return (
    <div
      className="relative h-full w-full"
      role="group"
      aria-label="视频播放器"
      tabIndex={0}
      onClick={(event) => {
        // 视频两侧留白只切换控件显隐，不影响播放状态。
        if (event.target === event.currentTarget)
          setControlsVisible((visible) => !visible)
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault()
          togglePlayback()
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          seek(currentTime + (event.key === 'ArrowRight' ? 5 : -5))
        }
      }}
    >
      <video
        {...props}
        ref={videoRef}
        controls={false}
        onClick={(event) => {
          event.stopPropagation()
          togglePlayback()
        }}
        onLoadedMetadata={(event) => {
          props.onLoadedMetadata?.(event)
          const video = event.currentTarget
          setDuration(Number.isFinite(video.duration) ? video.duration : 0)
          setPlaybackRate(video.playbackRate)
          setVolume(video.volume)
          setMuted(video.muted)
        }}
        onDurationChange={(event) => {
          props.onDurationChange?.(event)
          const value = event.currentTarget.duration
          setDuration(Number.isFinite(value) ? value : 0)
        }}
        onTimeUpdate={(event) => {
          props.onTimeUpdate?.(event)
          setCurrentTime(event.currentTarget.currentTime)
        }}
        onPlay={(event) => {
          props.onPlay?.(event)
          setPlaying(true)
        }}
        onPause={(event) => {
          props.onPause?.(event)
          setPlaying(false)
        }}
        onEnded={(event) => {
          props.onEnded?.(event)
          setPlaying(false)
        }}
        onVolumeChange={(event) => {
          props.onVolumeChange?.(event)
          setVolume(event.currentTarget.volume)
          setMuted(event.currentTarget.muted)
        }}
        onRateChange={(event) => {
          props.onRateChange?.(event)
          setPlaybackRate(event.currentTarget.playbackRate)
        }}
      />
      {controlsVisible && (
        <div
          className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center gap-3 bg-black/75 px-3 py-2 text-white"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            aria-label={playing ? '暂停' : '播放'}
            title={playing ? '暂停' : '播放'}
            className="cursor-pointer p-1 text-xl"
            onClick={togglePlayback}
          >
            {playing ? <PauseOutlined /> : <PlayCircleOutlined />}
          </button>
          <span className="text-xs tabular-nums">
            {formatVideoDuration(currentTime)} / {formatVideoDuration(duration)}
          </span>
          <input
            type="range"
            aria-label="播放进度"
            min={0}
            max={duration || 1}
            step="any"
            value={Math.min(currentTime, duration)}
            disabled={duration <= 0}
            className="min-w-16 flex-1 cursor-pointer accent-white"
            onChange={(event) => seek(Number(event.currentTarget.value))}
          />
          <button
            type="button"
            aria-label={muted || volume === 0 ? '取消静音' : '静音'}
            title={muted || volume === 0 ? '取消静音' : '静音'}
            aria-pressed={muted || volume === 0}
            className={`cursor-pointer p-1 text-lg ${muted || volume === 0 ? 'opacity-50' : ''}`}
            onClick={() => {
              const video = videoRef.current
              if (!video) return
              if (video.volume === 0) {
                video.volume = 1
                video.muted = false
              } else video.muted = !video.muted
            }}
          >
            <SoundOutlined />
          </button>
          <input
            type="range"
            aria-label="音量"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            className="w-20 cursor-pointer accent-white"
            onChange={(event) => {
              const video = videoRef.current
              if (!video) return
              video.volume = Number(event.currentTarget.value)
              video.muted = false
            }}
          />
          <select
            aria-label="播放倍速"
            className="cursor-pointer rounded bg-black px-1 py-1 text-sm text-white"
            value={playbackRate}
            onChange={(event) => {
              if (videoRef.current)
                videoRef.current.playbackRate = Number(
                  event.currentTarget.value,
                )
            }}
          >
            {rates.map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
