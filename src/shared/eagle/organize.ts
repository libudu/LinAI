import type { EagleSortBy, EagleSortOrder } from './types'

// Eagle 图片整理功能共享类型（前后端共用，无 UI / Node 依赖）

export const ORGANIZE_CLASSIFICATION_MODES = [
  'global',
  'subfolders',
  'recursive-rename',
] as const
export type OrganizeClassificationMode =
  (typeof ORGANIZE_CLASSIFICATION_MODES)[number]

/** 任务整体阶段 */
export type OrganizePhase =
  | 'running' // 队列执行中
  | 'paused' // 已暂停（用户暂停 / 执行出错 / 服务重启）
  | 'confirming' // 全部执行过一遍，有待确认结果或失败待处理项
  | 'done' // 无待执行、待确认或失败项，可创建新任务

/** 单图结果状态：结果实体在执行完成时才落盘，pending 仅用于「重新执行」 */
export type OrganizeItemStatus =
  | 'pending'
  | 'success' // 判定成功，待确认
  | 'failed' // 判定失败，在步骤 2 处理（上游错误 / 非 JSON / 响应结构或分类路径非法）
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
  /** 修改请求必须携带的任务身份，创建时间仅用于展示与历史排序。 */
  taskId: string
  /** 任务创建时间 */
  createdAt: number
  phase: OrganizePhase
  /** 本轮队列总数（追加后实时更新） */
  total: number
  /** 剩余未执行数量 */
  remaining: number
  /** 待确认数量（仅 success 且未处理） */
  pendingConfirm: number
  /** 步骤 2 失败待重试/待处理数量 */
  failedCount: number
  pausedReason: 'user' | 'error' | 'restart' | null
}

/** 批量确认逐项反馈；已确认项可安全重放，不重复扣减计数。 */
export type OrganizeConfirmItemResult =
  | {
      itemId: string
      ok: true
      outcome: 'confirmed' | 'already-confirmed' | 'purged'
    }
  | { itemId: string; ok: false; status: 400 | 404 | 409 | 500; error: string }

export interface OrganizeConfirmBatchResult {
  items: OrganizeConfirmItemResult[]
}

/** 任务详情视图（不含队列明细，GET /api/eagle/organize/task） */
export interface OrganizeTaskView {
  taskId: string
  classificationMode: OrganizeClassificationMode
  phase: OrganizePhase
  pausedReason: 'user' | 'error' | 'restart' | null
  compress: boolean
  /** 队列执行并发数（创建任务时由用户指定） */
  concurrency: number
  createdAt: number
  standards: OrganizeFolderStandard[]
  total: number
  executed: number
  pendingConfirm: number
  /** 本轮判定成功数，包含已确认/跳过的成功项；重新执行会撤回该项上一轮成功 */
  successCount: number
  /** 当前失败待处理数 */
  failedCount: number
}

/** 队列执行并发数：创建任务时用户输入，默认 20，范围 1~20 */
export const ORGANIZE_CONCURRENCY_DEFAULT = 20
export const ORGANIZE_CONCURRENCY_MIN = 1
export const ORGANIZE_CONCURRENCY_MAX = 20

/** 步骤 1 准备数据（GET /api/eagle/organize/prepare） */
export interface OrganizePrepareResp {
  /** 准备数据所属的任务；新建时也用于防止覆盖过期快照。 */
  taskId: string | null
  /** 当前选择的图片来源范围名称 */
  sourceFolderName: string
  classificationMode: OrganizeClassificationMode
  /** 子目录分类绑定的父目录名称；追加时不随图片来源变化。 */
  classificationFolderName?: string
  standards: OrganizeFolderStandard[]
  /** 当前范围内可处理图片总数（已排除 gif / 视频） */
  imageCount: number
  /** 当前范围内已进入本轮任务的图片数（包含已确认/跳过的历史项） */
  enqueuedCount: number
  /** 当前范围内尚未进入本轮任务的图片数（按 ID 做集合差） */
  availableCount: number
  /** 递归仅重命名模式下，按来源排序返回尚未入队图片的前 50 条预览。 */
  previewItems?: Pick<OrganizeQueueItem, 'itemId' | 'itemName'>[]
  /** 是否存在未完成任务；有则追加，无则新建 */
  hasActiveTask: boolean
  /** 当前任务分类标准与库中最新标准是否不一致（顺序/内容/增删），仅在存在未完成任务时计算 */
  hasStandardsMismatch?: boolean
}

/** 整理来源范围与排序；准备查询和新建请求共用。 */
export interface OrganizePrepareParams {
  folderId?: string
  classificationMode?: OrganizeClassificationMode
  sortBy: EagleSortBy
  sortOrder: EagleSortOrder
}

/** 失败条目详情（GET /api/eagle/organize/failed-items） */
export interface OrganizeFailedItem {
  itemId: string
  itemName: string | null
  error: string
  updatedAt: number
}

/** 单图结果记录（data/eagle/organize/items/<itemId>.json 的 value） */
export interface OrganizeItemRecord {
  itemId: string
  status: OrganizeItemStatus
  /** 本次判定是否需要重命名；旧结果缺省时沿用原有行为，并按当前名称重新检查。 */
  needsRename?: boolean
  /** AI 建议标题（success 且需要重命名时有值） */
  title?: string
  /** AI 判定的候选目标文件夹，按推荐顺序排列，最多 3 个（success 时有值；空数组表示不属于任何已知分类） */
  folderPaths?: string[]
  /** 疑似低质（success 时有值） */
  lowQuality?: boolean
  /** 失败原因（failed 时有值） */
  error?: string
  attempts: number
  updatedAt: number
}

/** 视觉判定 user 消息文本（system 提示词之外的固定内容，图片以 image_url 跟随其后） */
export const buildOrganizeVisionUserText = (
  needsRename = true,
  classificationMode: OrganizeClassificationMode = 'global',
): string =>
  classificationMode === 'recursive-rename'
    ? '请判断这张图片的标题与是否疑似低质，并仅返回一个 json 对象。'
    : needsRename
      ? '请判断这张图片的标题、至多三个候选分类文件夹与是否疑似低质，并仅返回一个 json 对象。'
      : '请判断这张图片的至多三个候选分类文件夹与是否疑似低质，并仅返回一个 json 对象。'

/** 沿用原有模型标识规则：去掉 provider 路径，提取首个英文词与版本数字，如 _gemini3.7。 */
export const getOrganizeModelTitleSuffix = (modelId: string): string => {
  const id = modelId.trim()
  if (!id) return ''
  const name = id.includes('/') ? id.split('/').pop()! : id
  const word = name.match(/[a-zA-Z]+/)?.[0].toLowerCase() ?? ''
  const version = name.match(/\d+(?:[.-]\d+)?/)?.[0].replace('-', '.') ?? ''
  return word || version ? `_${word}${version}` : ''
}

/** 名称最后一段的模型名称与当前模型相同时跳过重命名，忽略版本号与大小写。 */
export const needsOrganizeRename = (name: string, modelId: string): boolean => {
  const modelName = getOrganizeModelTitleSuffix(modelId).match(/[a-z]+/i)?.[0]
  const nameModel = name
    .split('_')
    .at(-1)!
    .match(/^([a-z]+)(?:\d+(?:[.-]\d+)?)?$/i)?.[1]
  return !modelName || nameModel?.toLowerCase() !== modelName.toLowerCase()
}

/** 视觉判定 system 提示词：服务端发送与前端预览共用同一份实现 */
export const buildOrganizeVisionSystemPrompt = (
  standards: OrganizeFolderStandard[],
  needsRename = true,
  classificationMode: OrganizeClassificationMode = 'global',
): string => {
  const renameOnly = classificationMode === 'recursive-rename'
  const lines = standards.map(
    (standard, index) =>
      `${index + 1}. ${standard.folderPath}：${standard.description}`,
  )
  return [
    renameOnly
      ? '你是图片重命名助手，只需根据图片内容生成标题，不进行文件夹分类。'
      : '你是图片整理助手，需要根据给定的文件夹分类标准对图片进行归类。',
    ...(!renameOnly
      ? [
          '',
          '分类标准（严格按优先级从上到下排列，越靠前优先级越高）：',
          ...lines,
        ]
      : []),
    '',
    '请对图片进行判断，并仅输出一个 json 对象（json_object），不要输出任何其他文字、注释或代码块标记，格式如下：',
    renameOnly
      ? '{"title": "图片标题", "lowQuality": false}'
      : needsRename
        ? '{"title": "图片标题", "folderPaths": ["首选分类文件夹路径", "次选分类文件夹路径"], "lowQuality": false}'
        : '{"folderPaths": ["首选分类文件夹路径", "次选分类文件夹路径"], "lowQuality": false}',
    '',
    '字段要求：',
    ...(needsRename
      ? [
          '- title：使用中文生成标题，限 50 个汉字以内尽可能详细。按“主体_主体细节_动作或状态_环境_媒介风格_色彩光影_构图视角_文字元素”的顺序组织；仅保留图片中明确可见或可判断的信息，缺少的部分直接省略，不要写“无”或其他占位内容，允许包含色情内容敏感词汇。',
        ]
      : []),
    ...(!renameOnly
      ? [
          '- folderPaths：从上述分类标准的路径中选择 0～3 个合适的候选项，按推荐程度从高到低排列且不得重复；分类适配程度相近时，优先选择分类标准中更靠前的路径；若图片不属于任何已知分类，返回空数组 []，不要虚构路径或返回“不属于任何分类”',
        ]
      : []),
    '- lowQuality：图片是否疑似低质（分辨率低、画面主体不清晰、美学品味较差等）',
  ].join('\n')
}

/** 单图结果摘要（实体列表接口返回，不含 value 正文） */
export interface OrganizeItemSummary {
  status: OrganizeItemStatus
  needsRename?: boolean
  /** AI 判定的候选目标文件夹，按推荐顺序排列（用于按分类排序） */
  folderPaths?: string[]
  /** 疑似低质（用于优先展示） */
  lowQuality?: boolean
}

/** 待确认结果列表项（GET /api/eagle/organize/results） */
export interface OrganizeResultListItem {
  itemId: string
  status: OrganizeItemStatus
  updatedAt: number
  needsRename?: boolean
  /** AI 判定的候选目标文件夹，按推荐顺序排列（用于按分类排序） */
  folderPaths?: string[]
  /** 疑似低质（用于优先展示） */
  lowQuality?: boolean
  /** 图片修改时间（用于按修改时间排序） */
  mtime?: number
  /** 原图宽度（像素） */
  width?: number
  /** 原图高度（像素） */
  height?: number
  /** 原图文件大小（字节数） */
  size?: number
}

/** 单图结果详情（GET /api/eagle/organize/results/:itemId），附条目当前名称便于对比建议标题 */
export interface OrganizeResultDetail extends OrganizeItemRecord {
  /** Eagle 条目当前名称；条目已从库中删除时为 null */
  itemName: string | null
  /** Eagle 条目当前所在文件夹的完整路径；未归入文件夹或条目不存在时为空数组 */
  itemFolderPaths: string[]
  /** 原图宽度（像素） */
  width?: number
  /** 原图高度（像素） */
  height?: number
  /** 原图文件大小（字节数） */
  size?: number
}

/** 执行中步骤的队列预览行状态 */
export type OrganizeQueueItemState =
  | 'processing' // 正在请求视觉判定
  | 'pending' // 排队等待派发
  | 'failed' // 判定失败（信息列展示失败原因）

/** 执行中步骤的队列预览行（完成无误的项不返回，交由结果确认步骤处理） */
export interface OrganizeQueueItem {
  itemId: string
  /** Eagle 条目当前名称；条目已从库中删除时为 null */
  itemName: string | null
  state: OrganizeQueueItemState
  /** 失败原因（failed 时有值） */
  error?: string
}

/** 队列预览（GET /api/eagle/organize/queue?limit=20） */
export interface OrganizeQueueResp {
  /** 按队列顺序截取的前 limit 行 */
  items: OrganizeQueueItem[]
  /** 未完成（执行中 / 待处理 / 失败）总条数，用于「仅展示前 N 条」提示 */
  total: number
}
