import type { EagleFolder, EagleMediaType } from '@/shared/eagle/types'
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import { Alert, Button, Descriptions, Form, Modal, Spin, message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { DirectoryPicker } from '../SettingModal/DirectoryPicker'
import { formatFileSize } from '../components/formatFileSize'
import { RefreshQueue } from '../refreshQueue'
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

export function useFolderDownloads(
  folders: EagleFolder[],
  mediaType: EagleMediaType,
) {
  const { libraryMode, libraryPath, setEagleConfig } = useEagleConfig()
  const connectionId = useEagleSharing((state) => state.outgoing?.id)
  const connectionState = useEagleSharing((state) => state.outgoing?.state)
  const permissionsRevision = useEagleSharing(
    (state) => state.outgoing?.permissionsRevision,
  )
  const progress = useEagleSharing((state) =>
    state.downloads.map((task) => `${task.id}:${task.state}`).join('|'),
  )
  const pendingFolderIds = useEagleSharing(
    useShallow((state) =>
      state.downloads
        .filter(
          (task) =>
            task.connectionId === state.outgoing?.id &&
            task.mediaType === mediaType &&
            (task.state === 'queued' || task.state === 'running'),
        )
        .map((task) => task.folderId),
    ),
  )
  const pendingFolders = useMemo(
    () => new Set(pendingFolderIds),
    [pendingFolderIds],
  )
  const [statuses, setStatuses] = useState<Statuses>({})
  const [selected, setSelected] = useState<EagleFolder | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [directory, setDirectory] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const request = useRef(0)
  const refreshStatuses = useRef<() => Promise<void>>(async () => {})
  const [statusQueue] = useState(
    () => new RefreshQueue(() => refreshStatuses.current()),
  )
  const remote = libraryMode === 'remote'
  const connected = connectionState === 'approved'
  useEffect(() => {
    request.current++
    setSelected(null)
    setPlan(null)
    setError('')
    setBusy(false)
  }, [connectionId, remote, mediaType])
  useEffect(() => {
    // 媒体类型、连接、权限或本地库改变时清空；普通刷新保留已确认的状态。
    setStatuses({})
  }, [
    remote,
    connected,
    connectionId,
    permissionsRevision,
    libraryPath,
    mediaType,
  ])
  useEffect(() => {
    let active = true
    refreshStatuses.current = async () => {
      if (!active || !remote || !connected) return
      try {
        const result = await fetchFolderDownloadStatuses(mediaType)
        if (
          active &&
          result.connectionId === connectionId &&
          result.mediaType === mediaType
        )
          setStatuses(result.folders)
      } catch {
        // 暂时读取失败时保留当前状态，避免已完成图标退回下载图标。
      }
    }
    if (!remote || !connected) {
      return () => {
        active = false
      }
    }
    const timer = window.setTimeout(() => {
      // 在途请求串行合并；期间的新变化只补拉一次，旧响应不能覆盖新上下文。
      void statusQueue.request()
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
    mediaType,
    folders,
    progress,
    refresh,
    statusQueue,
  ])

  const loadPlan = useCallback(
    async (folder: EagleFolder) => {
      const version = ++request.current
      setBusy(true)
      setError('')
      setPlan(null)
      try {
        const next = await prepareFolderDownload(folder.id, mediaType)
        if (request.current === version) setPlan(next)
      } catch (error) {
        if (request.current === version)
          setError(error instanceof Error ? error.message : '读取下载清单失败')
      } finally {
        if (request.current === version) setBusy(false)
      }
    },
    [mediaType],
  )
  const select = useCallback(
    (folder: EagleFolder) => {
      if (!connected || pendingFolders.has(folder.id)) return
      setSelected(folder)
      setDirectory(useEagleConfig.getState().defaultLibraryPath)
      setError('')
      setPlan(null)
      if (useEagleConfig.getState().libraryPath) void loadPlan(folder)
    },
    [connected, pendingFolders, loadPlan],
  )
  const renderButton = useCallback(
    (folder: EagleFolder) => {
      if (!remote) return null
      const status = statuses[folder.id]
      const pending = pendingFolders.has(folder.id)
      const done = status?.download === 0
      const title = pending
        ? '已加入下载队列'
        : done
          ? '下载完成'
          : status
            ? `待下载 ${status.download} 个文件`
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
            className="!gap-1"
            title={title}
            aria-label={`${folder.name}：${title}`}
            disabled={pending || done || !connected}
            icon={
              pending ? (
                <ClockCircleOutlined />
              ) : done ? (
                <CheckCircleFilled style={{ color: '#52c41a' }} />
              ) : (
                <DownloadOutlined />
              )
            }
            onClick={() => select(folder)}
          >
            {!pending && !done && status && (
              <span className="text-xs tabular-nums">{status.download}</span>
            )}
          </Button>
        </span>
      )
    },
    [remote, statuses, pendingFolders, connected, select],
  )
  const close = () => {
    request.current++
    setSelected(null)
    setPlan(null)
    setError('')
    setBusy(false)
  }
  const configure = Boolean(selected && !libraryPath)
  const hasWork = Boolean(plan && plan.download > 0)
  const modal = (
    <Modal
      open={Boolean(selected)}
      width={460}
      title={configure ? '配置本地资源库' : '资源下载'}
      onCancel={close}
      confirmLoading={busy}
      maskClosable={!busy}
      okText={configure ? '保存并继续' : '确认下载'}
      okButtonProps={{
        disabled:
          !connected ||
          Boolean(selected && pendingFolders.has(selected.id)) ||
          (configure ? !directory.trim() : !hasWork),
      }}
      onOk={async () => {
        if (
          !selected ||
          busy ||
          !connected ||
          pendingFolders.has(selected.id) ||
          (!configure && !hasWork)
        )
          return
        const version = ++request.current
        setBusy(true)
        setError('')
        try {
          if (configure) {
            await setEagleConfig({ libraryPath: directory.trim() })
            if (request.current === version) await loadPlan(selected)
          } else if (plan) {
            const task = await startFolderDownload(plan.id)
            // 立即显示等待状态，不必等下一次 SSE；已有的更新快照优先。
            useEagleSharing.setState((state) => {
              if (
                state.outgoing?.id !== task.connectionId ||
                state.downloads.some((entry) => entry.id === task.id)
              )
                return state
              return { downloads: [...state.downloads, task] }
            })
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
              下载的资源将保存到本地资源库。默认在 LinAI 所在目录下创建
              「Eagle资源库」文件夹，也可选择其他空文件夹或已有 Eagle 资源库。
            </div>
            <Form.Item
              label="本地资源库目录"
              extra="点击「保存并继续」后创建或连接资源库，再确认本次下载。"
              className="!mb-0"
              required
            >
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
              {
                key: 'folder',
                label: '目标目录',
                children: <span className="break-all">{plan.folder}</span>,
              },
              {
                key: 'mediaType',
                label: '资源类型',
                children: plan.mediaType === 'image' ? '图片' : '视频',
              },
              {
                key: 'download',
                label: '下载数量',
                children: plan.download,
              },
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
