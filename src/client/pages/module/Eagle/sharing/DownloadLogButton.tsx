import { Alert, Button, Modal, Table } from 'antd'
import { useEffect, useState } from 'react'
import { fetchDownloadLogs } from './api'

type Logs = Awaited<ReturnType<typeof fetchDownloadLogs>>

export function DownloadLogButton({
  groupId,
  userId,
  name,
}: {
  groupId: string
  userId: string
  name: string
}) {
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<Logs>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setError('')
    setLogs([])
    void fetchDownloadLogs(groupId, userId)
      .then((value) => {
        if (active) setLogs(value)
      })
      .catch((error) => {
        if (active)
          setError(error instanceof Error ? error.message : '读取日志失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, groupId, userId])
  return (
    <>
      <Button
        type="link"
        size="small"
        style={{ paddingInlineStart: 0 }}
        onClick={() => setOpen(true)}
      >
        日志
      </Button>
      <Modal
        open={open}
        title={`${name} · 下载日志`}
        footer={null}
        onCancel={() => setOpen(false)}
        width={640}
      >
        {error && (
          <Alert className="mb-3" type="error" showIcon title={error} />
        )}
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={logs}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: '文件夹', dataIndex: 'folder', ellipsis: true },
            {
              title: '时间',
              dataIndex: 'createdAt',
              width: 180,
              render: (value: number) => new Date(value).toLocaleString(),
            },
          ]}
        />
      </Modal>
    </>
  )
}
