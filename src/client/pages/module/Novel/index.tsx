import { Alert, Button } from 'antd'
import { useEffect } from 'react'
import { ContextDrawer } from './ContextDrawer'
import { useNovelConfig } from './hooks/useNovelConfig'
import { ResourcePanel } from './ResourcePanel'
import { openNovelSettingModal } from './SettingModal'
import { Timeline } from './Timeline'
import { useNovelStore } from './store'

// 小说生成页面：左栏资源区（260px）+ 主栏章节时间线 + 右侧上下文抽屉
export const Novel = () => {
  const novelApiKey = useNovelConfig((s) => s.novelApiKey)
  const fetchNovelConfig = useNovelConfig((s) => s.fetchNovelConfig)
  const currentNovelId = useNovelStore((s) => s.currentNovelId)
  const fetchNovels = useNovelStore((s) => s.fetchNovels)
  const fetchNovel = useNovelStore((s) => s.fetchNovel)

  useEffect(() => {
    fetchNovelConfig()
  }, [fetchNovelConfig])

  useEffect(() => {
    fetchNovels()
  }, [fetchNovels])

  useEffect(() => {
    if (currentNovelId) fetchNovel(currentNovelId)
  }, [currentNovelId, fetchNovel])

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="m-0 flex items-center justify-between text-2xl font-bold text-slate-800">
        小说生成
      </div>

      {/* 未配置 API Key 时引导打开设置 */}
      {!novelApiKey && (
        <Alert
          type="warning"
          showIcon
          message="尚未配置小说生成的 API Key"
          description="生成前需要先配置 DeepSeek（或云雾等 OpenAI 兼容中转）的 API Key"
          action={
            <Button
              size="small"
              type="primary"
              onClick={() => openNovelSettingModal()}
            >
              去设置
            </Button>
          }
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
        {/* 左栏资源区：桌面端 260px 吸顶独立滚动 */}
        <aside className="w-full shrink-0 self-start rounded-lg border border-slate-200 bg-white p-3 md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:w-[260px] md:overflow-y-auto">
          <ResourcePanel />
        </aside>
        {/* 主栏章节时间线 */}
        <main className="min-w-0 flex-1">
          <Timeline />
        </main>
      </div>

      <ContextDrawer />
    </div>
  )
}
