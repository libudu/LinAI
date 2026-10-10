import type { SaveEagleItemMediaEditsParams } from '../api'

export const normalizeRotation = (degrees: number) =>
  ((degrees % 360) + 360) % 360

/** 预览角度转换为操作列表；无旋转时没有待保存的编辑。 */
export const getRotationEditOperations = (
  degrees: number,
): SaveEagleItemMediaEditsParams['operations'] => {
  const rotation = normalizeRotation(degrees)
  return rotation === 90 || rotation === 180 || rotation === 270
    ? [{ type: 'rotate', degrees: rotation }]
    : []
}
