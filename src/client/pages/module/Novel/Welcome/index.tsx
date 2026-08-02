import { Button, Input, message } from 'antd'
import { useState } from 'react'
import { useNovelConfig } from '../hooks/useNovelConfig'
import { classifyFirstIntent } from '../service/intent'
import { useNovelStore } from '../store'
import { findChapterText } from '../types'
import { QuickPrompts } from './QuickPrompts'
import { RefUpload, type PendingRef } from './RefUpload'

// 书名取用户要求的首行，截断 20 字
const deriveTitle = (instruction: string): string => {
  const firstLine =
    instruction
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0) || ''
  return firstLine.slice(0, 20) || '未命名小说'
}

// 欢迎页：未选中任何小说时展示。参考上传 + 快捷按钮 + 用户要求输入框，
// 提交后自动创建小说，由 AI 判断用户意图（设定/大纲/正文）并开始首次生成
export const Welcome = () => {
  const novelApiKey = useNovelConfig((s) => s.novelApiKey)
  const createNovel = useNovelStore((s) => s.createNovel)
  const uploadRef = useNovelStore((s) => s.uploadRef)
  const startGeneration = useNovelStore((s) => s.startGeneration)

  const [refs, setRefs] = useState<PendingRef[]>([])
  const [requirement, setRequirement] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    const instruction = requirement.trim()
    if (!instruction) {
      message.warning('请填写用户要求')
      return
    }
    setSubmitting(true)
    try {
      // 1. 创建小说（书名取要求首行），创建后即为当前书并进入编辑页
      const ok = await createNovel(deriveTitle(instruction))
      if (!ok) return
      // 2. 暂存的参考文逐篇落盘
      for (const ref of refs) {
        await uploadRef(ref.title, ref.content)
      }
      // 3. 未配置 API Key 时仅创建书籍，编辑页顶部会引导去设置
      if (!novelApiKey) return
      // 4. 由 AI 判断用户意图，开始首次生成
      const novelId = useNovelStore.getState().currentNovelId
      if (!novelId) return
      const intent = await classifyFirstIntent(instruction)
      if (intent === 'setting') {
        await startGeneration({ kind: 'setting', novelId, instruction })
      } else if (intent === 'outline') {
        await startGeneration({ kind: 'outline', novelId, instruction })
      } else {
        // 正文依赖大纲：先生成第一章大纲，再生成正文
        await startGeneration({ kind: 'outline', novelId, instruction })
        const novel = useNovelStore.getState().currentNovel
        const chapter = novel?.chapters[0]
        if (novel && chapter && findChapterText(novel, chapter.id, 'outline')) {
          await startGeneration({
            kind: 'content',
            novelId,
            chapterId: chapter.id,
            instruction,
          })
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 py-4 md:py-10">
      <div className="text-center">
        <h1 className="text-xl font-bold text-slate-800">开始一本新小说</h1>
        <p className="mt-1 text-sm text-slate-500">
          上传参考文、填写你的要求，提交后自动创建小说并开始生成
        </p>
      </div>

      {/* 1. 参考上传（可选，随小说一起创建） */}
      <RefUpload refs={refs} onChange={setRefs} />

      {/* 2. 快捷按钮：一键填入预制提示词 */}
      <QuickPrompts onSelect={setRequirement} />

      {/* 3. 用户要求输入框 */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-sm font-medium text-slate-600">用户要求</div>
        <Input.TextArea
          rows={5}
          placeholder="描述你想要的小说：题材、世界观、角色、风格、想直接生成设定/大纲还是正文…"
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
        />
        <Button
          type="primary"
          block
          className="mt-3"
          loading={submitting}
          disabled={!requirement.trim()}
          onClick={handleSubmit}
        >
          创建小说
        </Button>
      </section>
    </div>
  )
}
