import {
  PauseOutlined,
  PlayCircleOutlined,
  SoundOutlined,
} from '@ant-design/icons'
import { type ComponentProps, useEffect, useRef, useState } from 'react'
import { useVideoPlayerGestures } from './useVideoPlayerGestures'

type VideoPlayerProps = Omit<
  ComponentProps<'video'>,
  'controls' | 'onClick' | 'ref'
> & {
  onPlaybackRateChange?: (rate: number) => void
  interactionDisabled?: boolean
}

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
export function VideoPlayer({
  onPlaybackRateChange,
  interactionDisabled = false,
  ...props
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [controlsVisible, setControlsVisible] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [controlsActivity, setControlsActivity] = useState(0)
  const [controlsHovered, setControlsHovered] = useState(false)
  const [controlsFocused, setControlsFocused] = useState(false)
  const showControls = () => {
    setControlsVisible(true)
    setControlsActivity((value) => value + 1)
  }
  const toggleControls = () => {
    setControlsVisible((visible) => !visible)
    setControlsActivity((value) => value + 1)
    setControlsHovered(false)
    setControlsFocused(false)
  }
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
  const { active, feedback, handlers } = useVideoPlayerGestures(
    videoRef,
    showControls,
    toggleControls,
    togglePlayback,
  )
  const displayedTime = feedback?.mode === 'seek' ? feedback.time : currentTime
  useEffect(() => {
    if (
      !controlsVisible ||
      !playing ||
      active ||
      controlsHovered ||
      controlsFocused
    )
      return
    const timer = setTimeout(() => setControlsVisible(false), 3000)
    return () => clearTimeout(timer)
  }, [
    controlsVisible,
    controlsActivity,
    playing,
    active,
    controlsHovered,
    controlsFocused,
  ])

  return (
    <div
      {...(interactionDisabled ? {} : handlers)}
      className="relative h-full w-full touch-none select-none"
      role="group"
      aria-label="视频播放器"
      aria-description="单击显示或隐藏控件，双击播放或暂停，长按临时使用 2 倍速，左右拖动后松开跳转进度"
      tabIndex={interactionDisabled ? -1 : 0}
      onClick={(event) => {
        // 指针点击由手势统一处理，兼容辅助技术发出的无指针点击。
        if (!interactionDisabled && event.detail === 0) toggleControls()
      }}
      onKeyDown={(event) => {
        if (interactionDisabled || event.target !== event.currentTarget) return
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault()
          showControls()
          togglePlayback()
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          showControls()
          seek(
            (videoRef.current?.currentTime ?? 0) +
              (event.key === 'ArrowRight' ? 5 : -5),
          )
        }
      }}
    >
      <video
        {...props}
        ref={videoRef}
        controls={false}
        draggable={false}
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
          showControls()
        }}
        onEnded={(event) => {
          props.onEnded?.(event)
          setPlaying(false)
          showControls()
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
      {feedback && (
        <div
          role="status"
          className="pointer-events-none absolute inset-x-0 top-6 z-20 flex justify-center text-white"
        >
          <div className="rounded-lg bg-black/75 px-4 py-2 text-sm tabular-nums">
            {feedback.mode === 'speed' ? (
              '长按 2× 倍速'
            ) : (
              <>
                {feedback.offset < 0 ? '后退' : '前进'}{' '}
                {Math.round(Math.abs(feedback.offset) * 10) / 10} 秒
                <span className="ml-3">
                  {formatVideoDuration(feedback.time)} /{' '}
                  {formatVideoDuration(duration)}
                </span>
              </>
            )}
          </div>
        </div>
      )}
      {controlsVisible && !interactionDisabled && (
        <div
          data-video-controls
          className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center gap-3 bg-black/75 px-3 py-2 text-white"
          onClick={(event) => event.stopPropagation()}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') setControlsHovered(true)
          }}
          onPointerLeave={() => setControlsHovered(false)}
          onFocus={() => setControlsFocused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setControlsFocused(false)
          }}
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
            {formatVideoDuration(displayedTime)} /{' '}
            {formatVideoDuration(duration)}
          </span>
          <input
            type="range"
            aria-label="播放进度"
            min={0}
            max={duration || 1}
            step="any"
            value={Math.min(displayedTime, duration)}
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
              const video = videoRef.current
              if (!video) return
              const rate = Number(event.currentTarget.value)
              video.playbackRate = rate
              // 仅用户明确选择倍速时保存偏好，长按的临时 2 倍速不落盘。
              onPlaybackRateChange?.(rate)
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
