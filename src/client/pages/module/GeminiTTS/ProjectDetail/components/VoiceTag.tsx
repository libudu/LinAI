import { PlusOutlined } from '@ant-design/icons'
import { Input, InputRef, Popover, Tag } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { voiceList } from '../VoicePreview/voiceConfig'
import { useCustomVoiceTagsStore } from './useCustomVoiceTagsStore'

interface VoiceTagProps {
  voiceName: string
  hideName?: boolean
  allowCustomTag?: boolean
}

export const VoiceTag = ({
  voiceName,
  hideName,
  allowCustomTag,
}: VoiceTagProps) => {
  const voiceInfo = voiceList.find((v) => v.name === voiceName)

  const { tags, addTag, removeTag } = useCustomVoiceTagsStore()
  const customTags = tags[voiceName] || []
  const [inputVisible, setInputVisible] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<InputRef>(null)

  useEffect(() => {
    if (inputVisible) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    }
  }, [inputVisible])

  const handleClose = (removedTag: string) => {
    removeTag(voiceName, removedTag)
  }

  const handleInputConfirm = () => {
    if (inputValue && customTags.indexOf(inputValue) === -1) {
      addTag(voiceName, inputValue)
    }
    setInputVisible(false)
    setInputValue('')
  }

  const customTagElements = (
    <>
      {customTags.map((tag) => (
        <Tag
          key={tag}
          closable
          onClose={(e) => {
            e.preventDefault()
            handleClose(tag)
          }}
        >
          {tag}
        </Tag>
      ))}
      {allowCustomTag && (
        <Popover
          content={
            <Input
              ref={inputRef}
              type="text"
              size="small"
              className="w-24"
              placeholder="输入音色标签"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onPressEnter={handleInputConfirm}
            />
          }
          trigger="click"
          open={inputVisible}
          onOpenChange={(visible: boolean) => {
            if (!visible) {
              handleInputConfirm()
            } else {
              setInputVisible(true)
            }
          }}
          placement="top"
          destroyTooltipOnHide
        >
          <Tag className="cursor-pointer border-dashed">
            <PlusOutlined />
          </Tag>
        </Popover>
      )}
    </>
  )

  if (!voiceInfo) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <Tag color="blue">{voiceName}</Tag>
        {customTagElements}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {!hideName && <Tag color="blue">{voiceInfo.name}</Tag>}
      <Tag color={voiceInfo.gender === '男' ? 'cyan' : 'magenta'}>
        {voiceInfo.gender}
      </Tag>
      <Tag color="lime">{voiceInfo.voice}</Tag>
      {customTagElements}
    </div>
  )
}
