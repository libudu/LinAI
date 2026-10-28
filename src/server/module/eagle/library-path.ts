import path from 'node:path'

/** 与 data 目录使用同一应用运行目录；仅保存配置时创建。 */
export const getDefaultLibraryPath = () =>
  path.join(process.cwd(), 'Eagle资源库')
