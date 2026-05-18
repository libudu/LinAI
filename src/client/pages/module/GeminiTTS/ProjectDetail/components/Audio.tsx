import {
  CaretRightOutlined,
  DownloadOutlined,
  PauseOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { Button } from 'antd'
import classNames from 'classnames'
import React, { useRef, useState } from 'react'
import AudioPlayer, { RHAP_UI } from 'react-h5-audio-player'
import 'react-h5-audio-player/lib/styles.css'
import './Audio.scss'

interface AudioProps {
  src?: string
  className?: string
  isReloading?: boolean
  onReload?: () => void
}

export const CustomAudio: React.FC<AudioProps> = ({
  src,
  className,
  isReloading,
  onReload,
}) => {
  const playerRef = useRef<AudioPlayer>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const togglePlay = () => {
    if (!playerRef.current) return
    const audio = playerRef.current.audio.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
  }

  return (
    <AudioPlayer
      ref={playerRef}
      src={src}
      className={classNames(className, 'custom-audio-player')}
      showSkipControls={false}
      showJumpControls={false}
      onPlay={() => setIsPlaying(true)}
      onPause={() => setIsPlaying(false)}
      onEnded={() => setIsPlaying(false)}
      onSeeked={() => {
        if (!playerRef.current) return
        const audio = playerRef.current.audio.current
        if (audio) {
          audio.play()
        }
      }}
      customControlsSection={[RHAP_UI.ADDITIONAL_CONTROLS]}
      customAdditionalControls={
        src
          ? [
              <a
                key="play"
                className="custom-audio-action-btn custom-audio-play"
                onClick={(e) => {
                  e.stopPropagation()
                  togglePlay()
                }}
                title={isPlaying ? '暂停' : '播放'}
              >
                {isPlaying ? <PauseOutlined /> : <CaretRightOutlined />}
              </a>,
              <a
                key="download"
                href={src}
                download
                className="custom-audio-action-btn custom-audio-download"
                onClick={(e) => e.stopPropagation()}
                title="下载音频"
              >
                <DownloadOutlined />
              </a>,
              ...(onReload
                ? [
                    <Button
                      key="reload"
                      type="primary"
                      size="small"
                      loading={isReloading}
                      icon={<ReloadOutlined />}
                      onClick={(e) => {
                        e.stopPropagation()
                        onReload()
                      }}
                    >
                      {'重新生成'}
                    </Button>,
                  ]
                : []),
            ]
          : []
      }
      customVolumeControls={[]}
      layout={onReload ? 'stacked' : 'horizontal'}
    />
  )
}
