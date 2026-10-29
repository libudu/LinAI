import { Alert, Button, Modal, Popconfirm, Space, Table, message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteSharingHistory, fetchSharingHistory } from './api'
import { DownloadLogButton } from './DownloadLogButton'

type History = Awaited<ReturnType<typeof fetchSharingHistory>>

export function SharingHistoryButton({
  groupId,
  name,
}: {
  groupId: string
  name: string
}) {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<History>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const reload = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true)
    try {
      const records = await fetchSharingHistory(groupId)
      if (request === sequence.current) {
        setHistory(records)
        setError('')
      }
    } catch (error) {
      if (request === sequence.current)
        setError(error instanceof Error ? error.message : '读取登录记录失败')
    } finally {
      if (request === sequence.current) setLoading(false)
    }
  }, [groupId])
  useEffect(() => {
    if (!open) return
    setHistory([])
    void reload()
    return () => {
      sequence.current++
    }
  }, [open, reload])
  return (
    <>
      <Button type="text" size="small" onClick={() => setOpen(true)}>
        登录记录
      </Button>
      <Modal
        title={`${name} · 登录记录`}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={860}
      >
        <div className="mb-3 flex justify-end">
          <Button
            size="small"
            loading={loading}
            disabled={deleting}
            onClick={() => void reload()}
          >
            刷新
          </Button>
        </div>
        {error && (
          <Alert className="mb-3" type="error" showIcon title={error} />
        )}
        <Table<History[number]>
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={history}
          scroll={{ x: 680 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: false,
            hideOnSinglePage: true,
          }}
          locale={{ emptyText: '暂无登录记录' }}
          columns={[
            { title: '名称', dataIndex: 'name', ellipsis: true, width: 120 },
            { title: '用户标识', dataIndex: 'id', ellipsis: true, width: 130 },
            { title: 'IP 地址', dataIndex: 'address', width: 130 },
            {
              title: '上次登录时间',
              dataIndex: 'lastLoginAt',
              width: 180,
              render: (value: number) => new Date(value).toLocaleString(),
            },
            {
              title: '操作',
              width: 120,
              render: (_, user) => (
                <Space size={4}>
                  <DownloadLogButton
                    groupId={groupId}
                    userId={user.id}
                    name={user.name}
                  />
                  <Popconfirm
                    title="删除这条登录记录？"
                    description="不影响当前连接和下载日志，下次重新连接时会再次记录。"
                    disabled={deleting}
                    onConfirm={async () => {
                      setDeleting(true)
                      // 使删除之前的在途读取失效，避免恢复已删除的行。
                      sequence.current++
                      try {
                        await deleteSharingHistory(groupId, user.id)
                        await reload()
                      } catch (error) {
                        message.error(
                          error instanceof Error
                            ? error.message
                            : '删除登录记录失败',
                        )
                      } finally {
                        setDeleting(false)
                        setLoading(false)
                      }
                    }}
                  >
                    <Button type="link" size="small" danger disabled={deleting}>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Modal>
    </>
  )
}
