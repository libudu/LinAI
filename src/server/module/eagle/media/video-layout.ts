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
  // 32 帧以内按 4 列排满每行，减少末行空位；更多帧使用 8 列。
  const columns = Math.min(frameCount <= 32 ? 4 : 8, frameCount)
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
