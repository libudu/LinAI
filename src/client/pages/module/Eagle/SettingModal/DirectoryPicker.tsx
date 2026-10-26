import { Alert, Button, Input, List, Modal, Space } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { fetchDirectories, validateDirectory } from '../sharing/api'

export function DirectoryPicker({
  value,
  onChange,
  allowEmpty = true,
  disabled = false,
}: {
  value?: string
  onChange?: (path: string) => void
  allowEmpty?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [listing, setListing] = useState<Awaited<
    ReturnType<typeof fetchDirectories>
  > | null>(null)
  const [path, setPath] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const sequence = useRef(0)
  const browse = async (path?: string) => {
    const current = ++sequence.current
    setLoading(true)
    setError('')
    try {
      const result = await fetchDirectories(path)
      if (sequence.current !== current) return
      setListing(result)
      setPath(result.path)
    } catch (error) {
      if (sequence.current === current)
        setError(error instanceof Error ? error.message : '读取目录失败')
    } finally {
      if (sequence.current === current) setLoading(false)
    }
  }
  useEffect(() => {
    if (open) void browse(value || undefined)
  }, [open])
  return (
    <>
      <Space.Compact className="w-full">
        <Input
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder="本地文件夹的绝对路径"
          disabled={disabled}
        />
        <Button onClick={() => setOpen(true)} disabled={disabled}>
          选择文件夹
        </Button>
      </Space.Compact>
      <Modal
        title="选择本地文件夹"
        open={open}
        onCancel={() => setOpen(false)}
        okText="选择此文件夹"
        cancelText="取消"
        confirmLoading={selecting}
        okButtonProps={{
          disabled: loading || !listing?.path || path !== listing.path,
        }}
        onOk={async () => {
          if (!listing?.path) return
          setSelecting(true)
          setError('')
          try {
            const result = await validateDirectory(listing.path, allowEmpty)
            onChange?.(result.path)
            setOpen(false)
          } catch (error) {
            setError(error instanceof Error ? error.message : '文件夹校验失败')
          } finally {
            setSelecting(false)
          }
        }}
      >
        <div className="space-y-3">
          <Input.Search
            value={path}
            onChange={(event) => setPath(event.target.value)}
            onSearch={(path) => void browse(path || undefined)}
            enterButton="打开"
            placeholder="输入绝对路径后打开"
          />
          <Button
            disabled={loading}
            onClick={() => void browse(listing?.parent || undefined)}
          >
            上一级 / 磁盘列表
          </Button>
          {error && <Alert type="error" showIcon title={error} />}
          <List
            className="max-h-72 overflow-y-auto"
            loading={loading}
            dataSource={listing?.directories || []}
            locale={{ emptyText: '此文件夹中没有子文件夹' }}
            renderItem={(entry) => (
              <List.Item>
                <Button
                  type="text"
                  className="w-full text-left"
                  onClick={() => void browse(entry.path)}
                >
                  {entry.name}
                </Button>
              </List.Item>
            )}
          />
          <div className="text-sm text-slate-500">
            {allowEmpty
              ? '请选择空文件夹或已有 Eagle .library 资源库；保存时会再次校验。'
              : '请选择已有 Eagle .library 资源库。'}
          </div>
        </div>
      </Modal>
    </>
  )
}
