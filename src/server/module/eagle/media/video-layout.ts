/** 视频联系表规则：从 0 秒开始采样，间隔按 2 的幂向上取整。 */
export const getVideoContactSheetLayout = (duration: number) => {
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error('无法读取有效的视频时长')
  const gridSize = duration <= 64 ? 4 : 8
  const capacity = gridSize ** 2
  const minimumInterval = duration <= 64 ? 1 : 4
  const interval = Math.max(
    minimumInterval,
    2 ** Math.ceil(Math.log2(duration / capacity)),
  )
  const frameCount = Math.min(capacity, Math.ceil(duration / interval))
  const columns = Math.min(gridSize, frameCount)
  return {
    interval,
    frameCount,
    columns,
    rows: Math.ceil(frameCount / columns),
    maxDimension: duration <= 64 ? 400 : 300,
    spacing: 4,
    quality: 60,
  }
}
