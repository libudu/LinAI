/**
 * Eagle 资源库核心服务统一导出入口。
 *
 * 聚合导出：
 * - types: 数据模型、配置常量与基础工具函数；
 * - index-state: 内存索引生命周期、文件扫描、本地缓存持久化与文件路径解析；
 * - query: 只读查询、文件夹树与计数计算、分类标准提取；
 * - operations: 文件夹与条目的写、改、删、清空等磁盘副作用操作。
 */

export * from './types'
export * from './index-state'
export * from './query'
export * from './operations'
