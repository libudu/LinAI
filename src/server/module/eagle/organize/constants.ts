// 图片整理模块自有常量（与 common/static 的同名常量分开定义，两边值可独立调整）

/** 变更总线资源 ID：service 注册、执行器发布共用 */
export const ORGANIZE_RESOURCE = 'eagle.organize'

/** 队列执行并发数（方案要求 5 并发请求视觉能力） */
export const EXECUTOR_CONCURRENCY = 5

/** 视觉判定上传前的压缩参数（内存中处理，不落盘） */
export const EAGLE_VISION_IMAGE_MAX_DIMENSION = 2000
export const EAGLE_VISION_IMAGE_QUALITY = 85
