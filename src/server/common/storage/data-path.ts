import path from 'path'

// 统一管理 data 根目录，消除散落的 process.cwd() 拼接
export const DATA_ROOT = path.join(process.cwd(), 'data')

export const dataPath = (...segments: string[]): string =>
  path.join(DATA_ROOT, ...segments)
