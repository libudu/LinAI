import {
  DeleteOutlined,
  DownOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { Button, Input, Popconfirm, Tooltip } from 'antd'
import { useEffect, useState } from 'react'
import { useNovelStore } from '../store'
import type { Novel, NovelChapter } from '../types'
import { findChapterArtifact } from '../types'
import { ContextTagBar } from './ContextTagBar'

// 大纲卡：纯文本编辑（大纲是一个文段）+ 按指令微调 + 重新生成
export const OutlineCard = ({
  chapter,
  novel,
}: {
  chapter: NovelChapter
  novel: Novel
}) => {
  const {
    collapsed,
    toggleCollapsed,
    updateArtifact,
    deleteArtifact,
    openDrawer,
    startGeneration,
    streaming,
    abortGeneration,
  } = useNovelStore()

  const collapsedKey = `outline:${chapter.id}`
  const isCollapsed = !!collapsed[collapsedKey]
  // 本章正在流式生成大纲时的会话（非空即处于生成中）
  const outlineStream =
    streaming &&
    streaming.target === 'outline' &&
    streaming.chapterId === chapter.id
      ? streaming
      : null

  const outline = findChapterArtifact(novel, chapter.id, 'outline')
  const [draft, setDraft] = useState(outline?.content ?? '')
  const [reviseText, setReviseText] = useState('')

  // 外部（生成落盘/微调）更新大纲后同步回本地编辑态
  useEffect(() => {
    setDraft(outline?.content ?? '')
  }, [outline?.content])

  // 提交大纲编辑（与现状一致则不提交）
  const commit = () => {
    if (!outline) return
    const content = draft.trim()
    if (!content || content === outline.content) return
    updateArtifact(outline.id, { content })
  }

  const handleRevise = (v: string) => {
    const instruction = v.trim()
    if (!instruction || outlineStream || !outline) return
    setReviseText('')
    startGeneration({
      op: 'revise',
      novelId: novel.id,
      targetId: outline.id,
      instruction,
    })
  }

  return (
    <div className="rounded-md border border-slate-200">
      {/* 卡头：折叠开关 + 溯源标签条 + 重新生成 */}
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2 select-none"
        onClick={() => toggleCollapsed(collapsedKey)}
      >
        <span className="text-xs text-slate-400">
          {isCollapsed ? <RightOutlined /> : <DownOutlined />}
        </span>
        <span className="text-sm font-medium text-slate-600">大纲</span>
        <div className="ml-auto flex items-center gap-1">
          <ContextTagBar artifact={outline} novel={novel} />
          {outline && (
            <Tooltip title="重新生成大纲（打开上下文抽屉）">
              <Button
                size="small"
                type="text"
                icon={<ReloadOutlined />}
                disabled={!!streaming}
                onClick={(e) => {
                  e.stopPropagation()
                  openDrawer({ outputType: 'outline', chapterId: chapter.id })
                }}
              />
            </Tooltip>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="space-y-2 border-t border-slate-100 px-3 py-2">
          {outlineStream ? (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {outlineStream.op === 'revise'
                    ? '按指令微调大纲中…'
                    : '大纲生成中…'}
                </span>
                <Button
                  size="small"
                  type="text"
                  danger
                  onClick={abortGeneration}
                >
                  中断
                </Button>
              </div>
              <div className="text-sm break-words whitespace-pre-wrap text-slate-600">
                {outlineStream.text || '等待响应…'}
              </div>
            </div>
          ) : !outline ? (
            <div className="py-2 text-center">
              <div className="mb-2 text-xs text-slate-400">还没有大纲</div>
              <Button
                size="small"
                type="primary"
                ghost
                disabled={!!streaming}
                onClick={() =>
                  openDrawer({ outputType: 'outline', chapterId: chapter.id })
                }
              >
                生成大纲
              </Button>
            </div>
          ) : (
            <>
              <Input.TextArea
                autoSize
                value={draft}
                placeholder="大纲内容（基调 / 节拍 / 禁区）"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
              />

              {/* 按指令微调 / 删除 */}
              <div className="flex items-center gap-2">
                <Input.Search
                  className="flex-1"
                  placeholder="按指令修改大纲，如：加强第3节的冲突"
                  value={reviseText}
                  onChange={(e) => setReviseText(e.target.value)}
                  enterButton="微调"
                  disabled={!!streaming}
                  onSearch={handleRevise}
                />
                <Popconfirm
                  title="删除该大纲？"
                  onConfirm={() => deleteArtifact(outline.id)}
                >
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={!!streaming}
                  />
                </Popconfirm>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
