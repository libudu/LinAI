import { Button, Empty } from 'antd'
import { useEffect } from 'react'
import { FolderTree } from './FolderTree'
import { ResourceGrid } from './ResourceGrid'
import { openEagleSettingModal } from './SettingModal'
import { useEagleConfig } from './SettingModal/useEagleConfig'
import { useEagleStore } from './store'
import { Toolbar } from './Toolbar'

// Eagle 图片管理：左侧文件夹目录树 + 右侧资源网格
export function Eagle() {
  const { libraryPath, fetchEagleConfig } = useEagleConfig()
  const init = useEagleStore((s) => s.init)

  useEffect(() => {
    fetchEagleConfig().then(() => {
      // 配置拉取后再决定是否加载索引（未配置库路径时由引导页接管）
      if (useEagleConfig.getState().libraryPath) {
        init()
      }
    })
  }, [fetchEagleConfig, init])

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
    // 主容器是自适应高度，这里用视口高度减去 main 的垂直内边距，让左右栏内部滚动
    <div className="flex h-[calc(100dvh-1.5rem)] overflow-hidden sm:h-[calc(100dvh-3rem)]">
      <div className="w-60 shrink-0 border-r border-slate-200 dark:border-slate-700">
        <FolderTree />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar />
        <ResourceGrid />
      </div>
    </div>
  )
}
