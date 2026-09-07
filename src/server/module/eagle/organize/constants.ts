// 图片整理模块自有常量（与 common/static 的同名常量分开定义，两边值可独立调整）

/** 变更总线资源 ID：service 注册、执行器发布共用 */
export const ORGANIZE_RESOURCE = 'eagle.organize'

/** 视觉判定上传前的压缩参数（内存中处理，不落盘） */
export const EAGLE_VISION_IMAGE_MAX_DIMENSION = 1600
export const EAGLE_VISION_IMAGE_QUALITY = 60

/** 单图判定连续失败暂停阈值：单图判定连续失败达到该次数时自动暂停队列派发并发送系统错误通知 */
export const ORGANIZE_ERROR_PAUSE_THRESHOLD = 10
export const ERROR_PAUSE_THRESHOLD = ORGANIZE_ERROR_PAUSE_THRESHOLD

/** 全局相邻两次视觉请求派发的最短间隔时间（毫秒），避免瞬时并发过密打满上游或触发限流 */
export const ORGANIZE_REQUEST_INTERVAL_MS = 500
export const REQUEST_INTERVAL_MS = ORGANIZE_REQUEST_INTERVAL_MS
