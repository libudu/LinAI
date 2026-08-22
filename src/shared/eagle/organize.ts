// Eagle 图片整理功能共享类型（前后端共用，无 UI / Node 依赖）

/** 任务整体阶段 */
export type OrganizePhase =
  | 'running' // 队列执行中
  | 'paused' // 已暂停（用户暂停 / 执行出错 / 服务重启）
  | 'confirming' // 全部执行过一遍，有待确认结果
  | 'done' // 无待确认且无待执行，可创建新任务

/** 单图结果状态：结果实体在执行完成时才落盘，pending 仅用于「重新执行」 */
export type OrganizeItemStatus =
  | 'pending'
  | 'success' // 判定成功，待确认
  | 'failed' // 判定失败，待确认（上游错误 / 非 JSON / 不属于任何分类）
  | 'skipped' // 用户选择「不处理」
  | 'confirmed' // 已确认（改文件夹；是否同时修改标题由确认操作参数决定，不区分状态）

/** 分类标准快照（创建任务时固化，顺序即优先级，从上到下；子目录排在父目录之前，父目录作大类兜底） */
export interface OrganizeFolderStandard {
  folderId: string
  /** 展示与 AI 返回匹配用完整路径，如 "插画/风景" */
  folderPath: string
  name: string
  description: string
}

/** 按钮徽标与进度用的轻量状态（GET /api/eagle/organize/status） */
export interface OrganizeStatus {
  phase: OrganizePhase
  /** 剩余未执行数量 */
  remaining: number
  /** 待确认数量 */
  pendingConfirm: number
  pausedReason: 'user' | 'error' | 'restart' | null
}

/** 任务详情视图（不含队列明细，GET /api/eagle/organize/task） */
export interface OrganizeTaskView {
  phase: OrganizePhase
  pausedReason: 'user' | 'error' | 'restart' | null
  compress: boolean
  createdAt: number
  standards: OrganizeFolderStandard[]
  total: number
  executed: number
  pendingConfirm: number
  /** 判定成功 / 失败数量（执行器维护） */
  successCount: number
  failedCount: number
}

/** 步骤 1 准备数据（GET /api/eagle/organize/prepare） */
export interface OrganizePrepareResp {
  standards: OrganizeFolderStandard[]
  /** 当前范围内可处理图片数（已排除 gif / 视频） */
  imageCount: number
}

/** 单图结果记录（data/eagle/organize/items/<itemId>.json 的 value） */
export interface OrganizeItemRecord {
  itemId: string
  status: OrganizeItemStatus
  /** AI 建议标题（success 时有值） */
  title?: string
  /** AI 判定目标文件夹（success 时有值） */
  folderPath?: string
  /** 疑似低质（success 时有值） */
  lowQuality?: boolean
  /** 失败原因（failed 时有值） */
  error?: string
  attempts: number
  updatedAt: number
}

/** 视觉判定 user 消息文本（system 提示词之外的固定内容，图片以 image_url 跟随其后） */
export const ORGANIZE_VISION_USER_TEXT =
  '请判断这张图片的标题、所属分类文件夹与是否疑似低质。'

/** 视觉判定 system 提示词：服务端发送与前端预览共用同一份实现 */
export const buildOrganizeVisionSystemPrompt = (
  standards: OrganizeFolderStandard[],
): string => {
  const lines = standards.map(
    (standard, index) =>
      `${index + 1}. ${standard.folderPath}：${standard.description}`,
  )
  return [
    '你是图片整理助手，需要根据给定的文件夹分类标准对图片进行归类。',
    '',
    '分类标准（按优先级从上到下排列，越靠前优先级越高）：',
    ...lines,
    '',
    '请对图片进行判断，并仅输出一个 JSON 对象，不要输出任何其他文字、注释或代码块标记，格式如下：',
    '{"title": "图片标题", "folderPath": "分类文件夹路径", "lowQuality": false}',
    '',
    '字段要求：',
    '- title：概括图片内容的简短标题（使用图片内容对应的语言，通常为中文）',
    '- folderPath：从上述分类标准的路径中选择最合适的一个；若图片不属于任何一类，填 "不属于任何分类"',
    '- lowQuality：图片是否疑似低质（分辨率低、画面主体不清晰、美学品味较差等）',
  ].join('\n')
}

/** 单图结果摘要（实体列表接口返回，不含 value 正文） */
export interface OrganizeItemSummary {
  status: OrganizeItemStatus
}

/** 待确认结果列表项（GET /api/eagle/organize/results） */
export interface OrganizeResultListItem {
  itemId: string
  status: OrganizeItemStatus
  updatedAt: number
}

/** 单图结果详情（GET /api/eagle/organize/results/:itemId），附条目当前名称便于对比建议标题 */
export interface OrganizeResultDetail extends OrganizeItemRecord {
  /** Eagle 条目当前名称；条目已从库中删除时为 null */
  itemName: string | null
}
