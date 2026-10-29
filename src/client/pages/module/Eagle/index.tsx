import { usePlatform } from '@/client/hooks/usePlatform'
import { subscribeStorageEvent } from '@/client/service/storage-events'
import { Alert, Button, Empty, message } from 'antd'
import { useEffect, useState } from 'react'
import { FolderTree } from './FolderTree'
import { ResourceGrid } from './ResourceGrid'
import { openEagleSettingModal } from './SettingModal'
import { useEagleConfig } from './settings/useEagleConfig'
import { useEagleVisionConfig } from './settings/useEagleVisionConfig'
import { disconnectRemoteLibrary } from './sharing/api'
import { useFolderSharing } from './sharing/folderSharing'
import { useEagleSharing } from './sharing/store'
import { requestEagleLibraryRefresh, useEagleStore } from './store'
import { Toolbar } from './Toolbar'

// Eagle 图片管理：左侧文件夹目录树 + 右侧资源网格（移动端目录树改由工具栏抽屉进入）
export function Eagle() {
  const { libraryPath, libraryMode, remoteUrl, fetchEagleConfig, setEagleConfig } =
    useEagleConfig()
  const [switchingToLocal, setSwitchingToLocal] = useState(false)
  const { outgoing, connected } = useEagleSharing()
  const loadFolderSharing = useFolderSharing((state) => state.load)
  const remoteConnected = connected && outgoing?.state === 'approved'
  const fetchVisionConfig = useEagleVisionConfig((s) => s.fetchConfig)
  const init = useEagleStore((s) => s.init)
  const showFolderTree = useEagleStore((s) => s.showFolderTree)
  const { isMobile } = usePlatform()

  useEffect(() => {
    void fetchVisionConfig().catch(console.error)
    fetchEagleConfig()
      .then(() => {
        // 配置拉取后再决定是否加载索引（未配置库路径时由引导页接管）
        if (
          useEagleConfig.getState().libraryMode === 'local' &&
          useEagleConfig.getState().libraryPath
        ) {
          void init().catch(console.error)
        }
      })
      .catch(console.error)
  }, [fetchEagleConfig, fetchVisionConfig, init])

  useEffect(() => {
    if (libraryMode === 'remote' && remoteConnected)
      void init().catch(console.error)
  }, [
    libraryMode,
    remoteConnected,
    outgoing?.id,
    outgoing?.permissionsRevision,
    init,
  ])

  useEffect(() => {
    if (libraryMode !== 'local') return
    void loadFolderSharing()
    const unsubscribe = [
      'settings.eagle-folder-sharing',
      'settings.eagle-sharing',
    ].map((resource) =>
      subscribeStorageEvent(resource, () => void loadFolderSharing()),
    )
    return () => unsubscribe.forEach((close) => close())
  }, [libraryMode, loadFolderSharing])

  // 整理确认等写库操作发布 eagle.library 变更，订阅后刷新文件夹树与当前页（共享单条 SSE 连接）
  useEffect(() => {
    if (!libraryPath || libraryMode === 'remote') return
    return subscribeStorageEvent('eagle.library', () => {
      requestEagleLibraryRefresh().catch((error) =>
        console.error('刷新 Eagle 列表失败', error),
      )
    })
  }, [libraryPath, libraryMode])

  const switchToLocalLibrary = async () => {
    setSwitchingToLocal(true)
    try {
      await setEagleConfig({ libraryMode: 'local' })
      await disconnectRemoteLibrary()
      await useEagleStore.getState().reload()
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : '切换本地资源库失败',
      )
    } finally {
      setSwitchingToLocal(false)
    }
  }

  if (libraryMode === 'remote' && !remoteConnected) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
        <Alert
          type="warning"
          showIcon
          title="远程资源库未连接"
          description={
            outgoing?.error ||
            (outgoing?.state === 'connecting'
              ? '正在连接共享方的远程资源库。'
              : outgoing?.state === 'pending'
                ? '正在等待共享方同意连接。'
                : '请在 Eagle 设置中填写共享方的 IP 地址、端口和邀请码，重新连接远程资源库。')
          }
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="primary"
            disabled={switchingToLocal}
            onClick={() => openEagleSettingModal()}
          >
            连接远程资源库
          </Button>
          {libraryPath && (
            <Button loading={switchingToLocal} onClick={switchToLocalLibrary}>
              切换为本地资源库
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (libraryMode === 'local' && !libraryPath) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty description="尚未配置 Eagle 资源库路径">
          <Button type="primary" onClick={() => openEagleSettingModal()}>
            去配置
          </Button>
        </Empty>
      </div>
    )
  }

  return (
    // 主容器贴边拉满（路由配了 fullBleed）：视口高度即容器高度，让左右栏内部滚动；
    // md 以下还有全局 sticky 顶栏（h-10 内容 + py-2.5 + 1px 边框 = 61px），不减去会多出一条外层滚动条
    <div
      key={libraryMode === 'remote' ? remoteUrl : libraryPath}
      className="flex h-[calc(100dvh-61px)] overflow-hidden md:h-dvh"
    >
      {!isMobile && showFolderTree && (
        <div className="w-[260px] shrink-0 border-r border-slate-200 dark:border-slate-700">
          <FolderTree />
        </div>
      )}
      {/* 资源列表区：原 main 的外围边距移到这里 */}
      <div className="flex min-w-0 flex-1 flex-col p-1 pb-0 sm:p-6 sm:pb-0">
        <Toolbar />
        <ResourceGrid />
      </div>
    </div>
  )
}
