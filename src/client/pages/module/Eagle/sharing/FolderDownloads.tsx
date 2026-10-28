import type { EagleFolder } from '@/shared/eagle/types'
import {
  CheckCircleFilled,
  DownloadOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { Alert, Button, Descriptions, Form, Modal, Spin, message } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DirectoryPicker } from '../SettingModal/DirectoryPicker'
import { formatFileSize } from '../components/formatFileSize'
import { useEagleConfig } from '../settings/useEagleConfig'
import {
  fetchFolderDownloadStatuses,
  prepareFolderDownload,
  startFolderDownload,
} from './api'
import { useEagleSharing } from './store'

type Statuses = Awaited<
  ReturnType<typeof fetchFolderDownloadStatuses>
>['folders']
type Plan = Awaited<ReturnType<typeof prepareFolderDownload>>

export function useFolderDownloads(folders: EagleFolder[]) {
  const { libraryMode, libraryPath, setEagleConfig } = useEagleConfig()
  const connectionId = useEagleSharing((state) => state.outgoing?.id)
  const connectionState = useEagleSharing((state) => state.outgoing?.state)
  const permissionsRevision = useEagleSharing(
    (state) => state.outgoing?.permissionsRevision,
  )
  const progress = useEagleSharing((state) =>
    state.downloads.map((task) => `${task.id}:${task.state}`).join('|'),
  )
  const [statuses, setStatuses] = useState<Statuses>({})
  const [selected, setSelected] = useState<EagleFolder | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [directory, setDirectory] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const request = useRef(0)
  const remote = libraryMode === 'remote'
  const connected = connectionState === 'approved'
  useEffect(() => {
    request.current++
    setSelected(null)
    setPlan(null)
    setError('')
    setBusy(false)
  }, [connectionId, remote])
  useEffect(() => {
    if (!remote || !connected) {
      setStatuses({})
      return
    }
    setStatuses({})
    let active = true
    const timer = window.setTimeout(() => {
      void fetchFolderDownloadStatuses()
        .then((result) => {
          if (active && result.connectionId === connectionId)
            setStatuses(result.folders)
        })
        .catch(() => {
          if (active) setStatuses({})
        })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [
    remote,
    connected,
    connectionId,
    permissionsRevision,
    libraryPath,
    folders,
    progress,
    refresh,
  ])

  const loadPlan = useCallback(async (folder: EagleFolder) => {
    const version = ++request.current
    setBusy(true)
    setError('')
    setPlan(null)
    try {
      const next = await prepareFolderDownload(folder.id)
      if (request.current === version) setPlan(next)
    } catch (error) {
      if (request.current === version)
        setError(error instanceof Error ? error.message : '读取下载清单失败')
    } finally {
      if (request.current === version) setBusy(false)
    }
  }, [])
  const select = useCallback(
    (folder: EagleFolder) => {
      setSelected(folder)
      setDirectory('')
      setError('')
      setPlan(null)
      if (useEagleConfig.getState().libraryPath) void loadPlan(folder)
    },
    [loadPlan],
  )
  const renderButton = useCallback(
    (folder: EagleFolder) => {
      if (!remote) return null
      const status = statuses[folder.id]
      const done = Boolean(status && status.download === 0 && status.sync === 0)
      const title = done
        ? '同步完成'
        : status?.download === 0
          ? '同步文件夹'
          : '下载文件夹'
      return (
        <span
          className="shrink-0"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
        >
          <Button
            type="text"
            size="small"
            title={title}
            aria-label={`${folder.name}：${title}`}
            disabled={done || !connected}
            icon={
              done ? (
                <CheckCircleFilled style={{ color: '#52c41a' }} />
              ) : status?.download === 0 ? (
                <SyncOutlined />
              ) : (
                <DownloadOutlined />
              )
            }
            onClick={() => select(folder)}
          />
        </span>
      )
    },
    [remote, statuses, connected, select],
  )
  const close = () => {
    request.current++
    setSelected(null)
    setPlan(null)
    setError('')
    setBusy(false)
  }
  const configure = Boolean(selected && !libraryPath)
  const modal = (
    <Modal
      open={Boolean(selected)}
      title={
        configure ? '配置本地资源库' : `资源下载 · ${selected?.name ?? ''}`
      }
      onCancel={close}
      confirmLoading={busy}
      maskClosable={!busy}
      okText={configure ? '保存并继续' : '确认下载'}
      okButtonProps={{
        disabled:
          !connected ||
          (configure
            ? !directory.trim()
            : !plan || plan.download + plan.sync === 0),
      }}
      onOk={async () => {
        if (!selected) return
        const version = ++request.current
        setBusy(true)
        setError('')
        try {
          if (configure) {
            await setEagleConfig({ libraryPath: directory.trim() })
            if (request.current === version) await loadPlan(selected)
          } else if (plan) {
            await startFolderDownload(plan.id)
            if (request.current === version) {
              close()
              setRefresh((value) => value + 1)
              message.success('已添加下载任务')
            }
          }
        } catch (error) {
          if (request.current === version)
            setError(error instanceof Error ? error.message : '操作失败')
        } finally {
          if (request.current === version) setBusy(false)
        }
      }}
    >
      <div className="space-y-4 py-3">
        {configure ? (
          <Form layout="vertical">
            <div className="mb-4">
              请选择本地空文件夹或已有的Eagle资源库目录
            </div>
            <Form.Item label="本地资源库目录" className="!mb-0" required>
              <DirectoryPicker
                value={directory}
                onChange={setDirectory}
                disabled={busy}
              />
            </Form.Item>
          </Form>
        ) : plan ? (
          <Descriptions
            column={1}
            items={[
              { key: 'download', label: '需要下载', children: plan.download },
              { key: 'sync', label: '需要同步', children: plan.sync },
              {
                key: 'bytes',
                label: '预计大小',
                children: formatFileSize(plan.bytes),
              },
            ]}
          />
        ) : busy ? (
          <div className="flex justify-center py-6">
            <Spin />
          </div>
        ) : null}
        {error && <Alert type="error" showIcon title={error} />}
      </div>
    </Modal>
  )
  return { renderButton, modal }
}
