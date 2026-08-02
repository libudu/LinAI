import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Popconfirm, Tooltip } from 'antd'
import { useNovelStore } from '../store'

// 历史小说导航栏：桌面端固定贴住全局导航栏右侧（--sidebar-w 由 App 注入，随全局导航收起联动），
// 移动端退化为页面顶部的横向滚动条；没有小说记录时不渲染
export const NovelNav = () => {
  const novels = useNovelStore((s) => s.novels)
  const currentNovelId = useNovelStore((s) => s.currentNovelId)
  const selectNovel = useNovelStore((s) => s.selectNovel)
  const removeNovel = useNovelStore((s) => s.removeNovel)

  if (novels.length === 0) return null

  return (
    <nav className="z-20 flex w-full shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-1.5 md:fixed md:inset-y-0 md:left-[var(--sidebar-w)] md:block md:w-52 md:overflow-x-hidden md:overflow-y-auto md:border-r md:border-b-0 md:p-3 md:transition-[left]">
      {/* 头部：标题（仅桌面端）+ 新建入口（回到欢迎页创建新小说） */}
      <div className="flex shrink-0 items-center md:mb-2 md:justify-between">
        <span className="hidden text-sm font-medium text-slate-600 md:block">
          我的小说
        </span>
        <Tooltip title="新建小说">
          <Button
            size="small"
            type="text"
            icon={<PlusOutlined />}
            onClick={() => selectNovel(null)}
          />
        </Tooltip>
      </div>

      {/* 小说列表：点击选中，hover（移动端常显）出现删除按钮 */}
      {novels.map((n) => (
        <div
          key={n.id}
          className={`group flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 md:mb-0.5 md:w-full ${
            n.id === currentNovelId
              ? 'bg-orange-50 text-[#EC883A]'
              : 'hover:bg-slate-100'
          }`}
          onClick={() => selectNovel(n.id)}
        >
          <span className="min-w-0 flex-1 truncate text-sm" title={n.title}>
            {n.title}
          </span>
          <Popconfirm
            title="删除该小说？"
            description="包含全部章节、设定与参考文，不可恢复"
            onConfirm={() => removeNovel(n.id)}
          >
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              className="md:opacity-0 md:group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            />
          </Popconfirm>
        </div>
      ))}
    </nav>
  )
}
