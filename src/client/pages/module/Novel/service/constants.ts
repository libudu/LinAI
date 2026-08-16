// 生成相关常量（自服务端 module/novel/constants 前移）
// 按文段类型区分的值（温度、版本上限等）不在此——见模块根的 artifactTypes.ts 注册表

export const REF_MAX_CHARS = 50_000 // 每篇参考文最多保留末尾 50k 字符（前端截取后上传）

export const DEFAULT_RECENT_FULL_CHAPTERS = 3 // 默认勾选的上限保护：历史正文超出 N 章时更早章节改挂摘要（创建书时随书保存）
export const DEFAULT_TARGET_LENGTH = 3_000 // 正文默认目标篇幅（字）
export const CONTINUE_PREFIX_CHARS = 2_000 // 续写时携带已有正文末尾的字数

export const ARTIFACT_MESSAGES_MAX = 20 // 每个文段保留的最近对话消息条数上限，超出丢弃最旧
