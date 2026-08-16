// 小说生成模块数据类型（前后端共享）
// 前端从 src/client/pages/module/Novel/types.ts re-export 复用
//
// 核心抽象：参考文 / 核心设定 / 章节大纲 / 正文 / 章节摘要 统一为 NovelArtifact（文段），
// 仅靠 type 区分；每次生成都是「参考若干文段（inputs）→ 产出一个文段」，
// 后端只提供统一的书籍实体存取，业务编排全部在前端 service/ 完成

// 文段类型：封闭联合足够覆盖当前全部场景，扩展时加成员即可
export type ArtifactType =
  | 'ref' // 用户上传的参考文（原小说）
  | 'setting' // 核心设定（人物、世界观等；定位灵活，用户自行命名）
  | 'outline' // 章节大纲
  | 'content' // 章节正文
  | 'summary' // 章节摘要

// 文段：一切可引用、可生成、可修改的文本资源（内容统一内联存储在书籍 JSON）
export interface NovelArtifact {
  id: string
  type: ArtifactType
  title: string // ref/setting 的标题；outline/content/summary 一般为空
  content: string
  chapterId?: string // outline/content/summary 归属的章节；ref/setting 无
  // 生成该文段时引用的文段 id 列表（生成溯源快照；手动创建为 []）。
  // 这是文段 DAG 的边：反向查询（"谁引用了我"）由前端遍历全部 artifacts 派生。
  // 引用的文段被删除后 id 仍保留，前端查不到即展示删除线（已删除）
  inputs: string[]
  // 版本号：新建为 1，任何内容修改 +1（阶段 4 的版本历史以此对齐）
  version: number
  // 该文段节点上的对话记录（阶段 2 的节点对话）。
  // 沙箱规则：只用于修改本节点，任何 generate 的上下文组装都不读它
  messages: ChatMessage[]
  estimatedTokens?: number // 生成时的上下文估算值，仅记录
  originalLength?: number // 仅 ref：截断前原始字符数（> content.length 即已截断）
  createdAt: number
  updatedAt: number
}

// 轻量章节容器：仅作大纲/正文/摘要的分组，无序号，按 createdAt 排序即先后关系
export interface NovelChapter {
  id: string
  title: string // 可空，用户可命名
  createdAt: number
  updatedAt: number
}

export interface Novel {
  id: string
  title: string
  chapters: NovelChapter[] // 按 createdAt 排序即章节顺序
  artifacts: NovelArtifact[]
  recentFullChapters: number // N：默认勾选的上限保护——历史正文超出 N 章时更早章节改挂摘要，默认 3
  createdAt: number
  updatedAt: number
}

// 上下文勾选：生成请求的入参，与生成的文段落盘的 inputs 同构。
// 全文/摘要的携带方式由 id 天然编码：勾选「全文」即引用该章 content 文段 id，
// 勾选「摘要」即引用该章 summary 文段 id
export interface ContextSelection {
  artifactIds: string[]
}

// 书籍列表项：前端列表页的展示形状（存储层为 EntityStore('novel.books') 的 summary，
// 旧的 data/novels/index.json 已废弃）
export interface NovelIndexItem {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  chapterCount: number
}

// EntityStore('novel.books') 的摘要：书籍列表所需信息，写入时由业务方提供
export interface NovelSummary {
  title: string
  chapterCount: number
}

// 文段操作：「生成什么」由输出文段类型（outputType）决定，「参考什么」由勾选（selection）决定，
// 两者都不是场景枚举；UI 标题仍说人话（生成大纲/生成正文），底层都是同一套操作
export type ArtifactOperation =
  | 'generate' // 参考勾选文段生成新文段，产出类型由 outputType 指定
  | 'revise' // 按指令整体修改某文段 → version +1
  | 'continue' // 续写 content 文段（拼接，version +1）
  | 'rewrite-range' // 选段重写（字符区间替换，version +1）

// AI 局部修改（patch）：模型按指令返回的编辑操作（阶段 3）。
// 采用搜索/区间定位：find 必须逐字摘自原文且在文段中恰好出现一次；
// 校验与顺序应用见前端 service/patch.ts（block 稳定 ID 方案仅记录在案，暂不引入）
export type ArtifactEditOp =
  | { op: 'replace-text'; find: string; content: string } // find 必须在文段中唯一出现
  | { op: 'insert-after'; find: string; content: string }
  | { op: 'delete-text'; find: string }
  | { op: 'append'; content: string }

export interface ArtifactPatch {
  operations: ArtifactEditOp[]
}

// 上下文组装产出的消息（OpenAI 兼容接口的 system/user/assistant 文本消息）
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
