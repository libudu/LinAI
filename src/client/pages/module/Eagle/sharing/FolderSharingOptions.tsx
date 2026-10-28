import { Alert, Button, Empty, Modal, Radio, Segmented, Space } from 'antd'
import { useEffect, useState } from 'react'
import { useEagleConfig } from '../settings/useEagleConfig'
import { useFolderSharing, type FolderSharingView } from './folderSharing'

export function FolderSharingOptions() {
  const remote = useEagleConfig((state) => state.libraryMode === 'remote')
  const {
    view,
    setView,
    selectedCode,
    selectUser,
    users,
    load,
    loading,
    loaded,
    error,
  } = useFolderSharing()
  const [open, setOpen] = useState(false)
  const [candidate, setCandidate] = useState('')
  useEffect(() => {
    if (open) void load()
  }, [open, load])
  if (remote) return null
  const selectedUser = users.find(
    (user) => user.invitationCode === selectedCode,
  )
  return (
    <div className="mt-3">
      <div className="mb-1 text-xs text-slate-400">共享文件夹可见性</div>
      <Segmented<FolderSharingView>
        block
        value={view}
        onChange={setView}
        options={[
          { value: 'hidden', label: '隐藏' },
          { value: 'everyone', label: '所有人' },
          { value: 'user', label: '指定人' },
        ]}
      />
      {view === 'user' && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate text-sm" title={selectedUser?.name}>
            {selectedUser?.name ?? '尚未选择共享人员'}
          </span>
          <Button
            size="small"
            onClick={() => {
              setCandidate(selectedCode)
              setOpen(true)
            }}
          >
            选择
          </Button>
        </div>
      )}
      {view !== 'hidden' && error && (
        <Alert
          className="mt-2"
          type="error"
          title={error}
          action={
            <Button size="small" loading={loading} onClick={() => void load()}>
              重试
            </Button>
          }
        />
      )}
      <Modal
        title="选择共享人员"
        open={open}
        centered
        okText="选择"
        cancelText="取消"
        onCancel={() => setOpen(false)}
        okButtonProps={{
          disabled:
            loading ||
            !loaded ||
            !users.some((user) => user.invitationCode === candidate),
        }}
        onOk={() => {
          selectUser(candidate)
          setOpen(false)
        }}
      >
        {error && (
          <Alert
            className="mb-3"
            type="error"
            title={error}
            action={
              <Button loading={loading} onClick={() => void load()}>
                重试
              </Button>
            }
          />
        )}
        {users.length > 0 ? (
          <Radio.Group
            value={candidate}
            disabled={loading || !loaded}
            onChange={(event) => setCandidate(event.target.value)}
          >
            <Space orientation="vertical">
              {users.map((user) => (
                <Radio key={user.invitationCode} value={user.invitationCode}>
                  {user.name}（{user.invitationCode}）
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        ) : (
          <Empty
            description={
              loading ? '加载共享人员…' : '请先在「远程互联」中添加人员'
            }
          />
        )}
      </Modal>
    </div>
  )
}
