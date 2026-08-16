// 文段类型（ArtifactType）的按类型事实注册表：UI 标签、tag 配色、生成温度、版本快照上限。
// 类型联合本身在 src/shared/novel/types.ts（属于落盘数据契约），本文件是纯前端的行为/展示定义。
// 新增类型时在 ARTIFACT_TYPE_DEFS 加一项，标签/配色/温度/版本上限全部自动跟随；
// 各类型自己的生成 prompt 任务段仍在 service/prompts.ts（prompt 文本的家）
import type { ArtifactType, Novel, NovelArtifact } from './types'
import { chapterIndex } from './types'

export interface ArtifactTypeDef {
  /** 中文名（类型 tag、节点标题、删除确认、revise 提示词等共用） */
  label: string
  /** antd Tag 配色（画布/模态框的类型区分） */
  tagColor: string
  /** 生成温度（调优备忘录见 docs/novel/prompts.md 第 6 节）：generate 按产出类型取值，revise/continue/rewrite-range 按目标文段类型取值 */
  temperature: number
  /** 历史版本快照保留上限（整本 JSON 体积控制，超出丢弃最旧） */
  revisionLimit: number
}

export const ARTIFACT_TYPE_DEFS: Record<ArtifactType, ArtifactTypeDef> = {
  ref: {
    label: '参考文',
    tagColor: 'cyan',
    temperature: 0.8, // ref 不可生成，占位
    revisionLimit: 20,
  },
  setting: {
    label: '设定',
    tagColor: 'purple',
    temperature: 0.8,
    revisionLimit: 20,
  },
  outline: {
    label: '大纲',
    tagColor: 'geekblue',
    temperature: 0.7,
    revisionLimit: 20,
  },
  content: {
    label: '正文',
    tagColor: 'green',
    temperature: 0.9,
    revisionLimit: 10, // 正文体积最大，快照上限收紧
  },
  summary: {
    label: '摘要',
    tagColor: 'orange',
    temperature: 0.3,
    revisionLimit: 20,
  },
}

export const temperatureOf = (type: ArtifactType): number =>
  ARTIFACT_TYPE_DEFS[type].temperature

// 节点标题：章节类文段用「第 N 章大纲/正文」（带章节名），其余用文段标题
export const artifactNodeTitle = (
  novel: Novel,
  artifact: NovelArtifact,
): string => {
  if (artifact.chapterId) {
    const index = chapterIndex(novel, artifact.chapterId)
    const chapterTitle =
      novel.chapters.find((c) => c.id === artifact.chapterId)?.title ?? ''
    const label = ARTIFACT_TYPE_DEFS[artifact.type].label
    return `第 ${index} 章${label}${chapterTitle ? ` · ${chapterTitle}` : ''}`
  }
  return artifact.title || ARTIFACT_TYPE_DEFS[artifact.type].label
}
