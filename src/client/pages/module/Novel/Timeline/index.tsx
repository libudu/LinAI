import { PlusOutlined } from '@ant-design/icons'
import { Button, Empty, Spin, Tag } from 'antd'
import { useNovelStore } from '../store'
import { sortedChapters } from '../types'
import { ChapterCard } from './ChapterCard'

// 新章节的大纲生成幽灵卡：章节由 service 在生成开始时创建，done 后才随刷新出现
const GhostChapterCard = ({ index }: { index: number }) => {
  const streaming = useNovelStore((s) => s.streaming)
  const abortGeneration = useNovelStore((s) => s.abortGeneration)
  if (!streaming) return null
  return (
    <div className="app-accent-outline rounded-lg border bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <span className="text-sm font-semibold">第 {index} 章</span>
        <Tag color="processing" className="mr-0">
          大纲生成中
        </Tag>
      </div>
      <div className="p-3">
        <div className="rounded-md border border-slate-200 px-3 py-2">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>大纲生成中…</span>
            <Button size="small" type="text" danger onClick={abortGeneration}>
              中断
            </Button>
          </div>
          <div className="text-sm break-words whitespace-pre-wrap text-slate-600">
            {streaming.text || '等待响应…'}
          </div>
        </div>
      </div>
    </div>
  )
}

// 章节时间线（主栏）：每章一组卡片（顺序 = 章节创建时间），底部「生成下一章大纲」置底
export const Timeline = () => {
  const currentNovelId = useNovelStore((s) => s.currentNovelId)
  const currentNovel = useNovelStore((s) => s.currentNovel)
  const loadingNovel = useNovelStore((s) => s.loadingNovel)
  const openDrawer = useNovelStore((s) => s.openDrawer)
  const streaming = useNovelStore((s) => s.streaming)

  if (!currentNovelId) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white py-16">
        <Empty description="请在左侧新建或选择一本书" />
      </div>
    )
  }
  if (!currentNovel) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white py-16 text-center">
        {loadingNovel ? <Spin /> : <Empty description="书籍加载失败" />}
      </div>
    )
  }

  const chapters = sortedChapters(currentNovel)
  // 生成新章节大纲时目标章节还没出现在本地数据中，用幽灵卡展示流式内容
  const showGhost =
    streaming?.target === 'outline' &&
    !chapters.some((c) => c.id === streaming.chapterId)

  return (
    <div className="space-y-4 pb-8">
      {chapters.map((chapter, i) => (
        <ChapterCard
          key={chapter.id}
          chapter={chapter}
          novel={currentNovel}
          index={i + 1}
          isLast={i === chapters.length - 1}
          isCurrent={i === chapters.length - 1}
        />
      ))}
      {showGhost && <GhostChapterCard index={chapters.length + 1} />}
      {chapters.length === 0 && !showGhost && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white/60 py-12">
          <Empty description="还没有章节，从生成第一章大纲开始" />
        </div>
      )}
      <div className="flex justify-center pt-2">
        <Button
          type="primary"
          size="large"
          icon={<PlusOutlined />}
          disabled={!!streaming}
          onClick={() => openDrawer({ kind: 'outline' })}
        >
          生成下一章大纲
        </Button>
      </div>
    </div>
  )
}
