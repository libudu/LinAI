import { Alert, Button, Input, Space } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { pickDirectory } from '../sharing/api'

export function DirectoryPicker({
  value,
  onChange,
  disabled = false,
}: {
  value?: string
  onChange?: (path: string) => void
  disabled?: boolean
}) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const pending = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      pending.current?.abort()
    },
    [],
  )
  const select = async () => {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setLoading(true)
    setError('')
    try {
      const result = await pickDirectory(value, controller.signal)
      if (!controller.signal.aborted && result) onChange?.(result.path)
    } catch (error) {
      if (!controller.signal.aborted)
        setError(error instanceof Error ? error.message : '选择文件夹失败')
    } finally {
      if (pending.current === controller) pending.current = null
      if (!controller.signal.aborted) setLoading(false)
    }
  }
  return (
    <div className="space-y-2">
      <Space.Compact className="w-full">
        <Input
          value={value}
          onChange={(event) => {
            setError('')
            onChange?.(event.target.value)
          }}
          placeholder="本地文件夹的绝对路径"
          disabled={disabled || loading}
        />
        <Button
          onClick={() => void select()}
          loading={loading}
          disabled={disabled}
        >
          选择文件夹
        </Button>
      </Space.Compact>
      {loading && (
        <div className="text-sm text-slate-500">
          请在 Windows 文件夹选择窗口中完成选择或取消。
        </div>
      )}
      {error && <Alert type="error" showIcon title={error} />}
    </div>
  )
}
