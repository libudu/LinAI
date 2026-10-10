import type { EagleItem } from '@/shared/eagle/types'
import { SaveOutlined } from '@ant-design/icons'
import { Button, message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { rotateEagleItem } from '../api'

export const normalizeRotation = (degrees: number) =>
  ((degrees % 360) + 360) % 360

/** 只保存旋转角度，缩放、平移和翻转仍是预览操作。 */
export function RotationSaveButton({
  id,
  contentVersion,
  degrees,
  video = false,
  onSaved,
  onBusyChange,
}: {
  id: string
  contentVersion?: string
  degrees: number
  video?: boolean
  onSaved: (item: EagleItem) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const rotation = normalizeRotation(degrees)
  if (!rotation && !saving) return null
  return (
    <Button
      icon={<SaveOutlined />}
      loading={saving}
      disabled={
        !contentVersion ||
        (rotation !== 90 && rotation !== 180 && rotation !== 270)
      }
      title="保存当前旋转角度并覆盖，原文件移入 Eagle 回收站"
      onClick={async (event) => {
        event.stopPropagation()
        if (
          savingRef.current ||
          !contentVersion ||
          ![90, 180, 270].includes(rotation)
        )
          return
        savingRef.current = true
        setSaving(true)
        onBusyChange?.(true)
        const hide = message.loading(
          video
            ? '正在旋转并保存视频，耗时取决于视频长度，请稍候…'
            : '正在旋转并保存图片…',
          0,
        )
        try {
          const result = await rotateEagleItem(id, {
            contentVersion,
            degrees: rotation as 90 | 180 | 270,
          })
          if (result.warning) message.warning(result.warning, 8)
          else message.success('已覆盖原文件，原始文件已移入 Eagle 回收站')
          if (mounted.current) onSaved(result.item)
        } catch (error) {
          message.error(error instanceof Error ? error.message : '旋转保存失败')
        } finally {
          hide()
          savingRef.current = false
          if (mounted.current) {
            setSaving(false)
            onBusyChange?.(false)
          }
        }
      }}
    >
      {saving ? (video ? '正在处理视频，请稍候…' : '正在保存…') : '覆盖原文件'}
    </Button>
  )
}
