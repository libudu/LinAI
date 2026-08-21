import { usePlatform } from '@/client/hooks/usePlatform'
import { Button, Empty } from 'antd'
import { useEffect } from 'react'
import { FolderTree } from './FolderTree'
import { ResourceGrid } from './ResourceGrid'
import { openEagleSettingModal } from './SettingModal'
import { useEagleConfig } from './SettingModal/useEagleConfig'
import { useEagleVisionConfig } from './SettingModal/useEagleVisionConfig'
import { useEagleStore } from './store'
import { Toolbar } from './Toolbar'

// Eagle 图片管理：左侧文件夹目录树 + 右侧资源网格（移动端目录树改由工具栏抽屉进入）
export function Eagle() {
  const { libraryPath, fetchEagleConfig } = useEagleConfig()
  const fetchVisionConfig = useEagleVisionConfig((s) => s.fetchConfig)
  const init = useEagleStore((s) => s.init)
  const { isMobile } = usePlatform()

  useEffect(() => {
    fetchVisionConfig()
    fetchEagleConfig().then(() => {
      // 配置拉取后再决定是否加载索引（未配置库路径时由引导页接管）
      if (useEagleConfig.getState().libraryPath) {
        init()
      }
    })
  }, [fetchEagleConfig, fetchVisionConfig, init])

  if (!libraryPath) {
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
    <div className="flex h-[calc(100dvh-61px)] overflow-hidden md:h-dvh">
      {!isMobile && (
        <div className="w-60 shrink-0 border-r border-slate-200 dark:border-slate-700">
          <FolderTree />
        </div>
      )}
      {/* 资源列表区：原 main 的外围边距移到这里 */}
      <div className="flex min-w-0 flex-1 flex-col p-3 pb-0 sm:p-6 sm:pb-0">
        <Toolbar />
        <ResourceGrid />
      </div>
    </div>
  )
}
