import { DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { Button, Input, Popconfirm, Tag } from 'antd'
import { useState } from 'react'
import { useNovelStore } from '../store'
import type { Novel, NovelChapter } from '../types'
import { ContentCard } from './ContentCard'
import { OutlineCard } from './OutlineCard'

// 章节容器：章号（创建时间位次）+ 可命名标题 + 删除（仅最后一章），内含大纲卡与正文卡
export const ChapterCard = ({
  chapter,
  novel,
  index,
  isLast,
  isCurrent,
}: {
  chapter: NovelChapter
  novel: Novel
  index: number
  isLast: boolean
  isCurrent: boolean
}) => {
  const editChapterTitle = useNovelStore((s) => s.editChapterTitle)
  const removeChapter = useNovelStore((s) => s.removeChapter)
  const [titleEditing, setTitleEditing] = useState(false)

  const commitTitle = (value: string) => {
    setTitleEditing(false)
    const title = value.trim()
    if (title && title !== chapter.title) {
      editChapterTitle(chapter.id, title)
    }
  }

  return (
    <div
      className={`rounded-lg border bg-white ${
        isCurrent ? 'border-[#EC883A]/70 shadow-sm' : 'border-slate-200'
      }`}
    >
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <span className="shrink-0 text-sm font-semibold">第 {index} 章</span>
        {titleEditing ? (
          <Input
            size="small"
            autoFocus
            className="max-w-60"
            defaultValue={chapter.title}
            placeholder="章节标题"
            onBlur={(e) => commitTitle(e.target.value)}
            onPressEnter={(e) =>
              commitTitle((e.target as HTMLInputElement).value)
            }
          />
        ) : (
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              chapter.title ? 'text-slate-700' : 'text-slate-300'
            }`}
          >
            {chapter.title || '未命名'}
          </span>
        )}
        {!titleEditing && (
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={() => setTitleEditing(true)}
          />
        )}
        {isCurrent && (
          <Tag color="orange" className="mr-0">
            当前章
          </Tag>
        )}
        {isLast && (
          <Popconfirm
            title="删除本章？"
            description="仅可删除最后一章，将同时删除其大纲、正文与摘要"
            onConfirm={() => removeChapter(chapter.id)}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        )}
      </div>
      <div className="space-y-3 p-3">
        <OutlineCard chapter={chapter} novel={novel} />
        <ContentCard chapter={chapter} novel={novel} />
      </div>
    </div>
  )
}
