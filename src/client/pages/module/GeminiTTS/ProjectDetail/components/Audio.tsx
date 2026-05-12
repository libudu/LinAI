import classNames from 'classnames'
import React from 'react'
import AudioPlayer from 'react-h5-audio-player'
import 'react-h5-audio-player/lib/styles.css'
import './Audio.scss'

interface AudioProps {
  src?: string
  className?: string
}

export const CustomAudio: React.FC<AudioProps> = ({ src, className }) => {
  return (
    <AudioPlayer
      src={src}
      className={classNames(className, 'custom-audio-player')}
      showSkipControls={false}
      showJumpControls={false}
      customAdditionalControls={[]}
      customVolumeControls={[]}
      layout="horizontal"
    />
  )
}
