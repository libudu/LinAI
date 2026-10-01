type DropTarget = { element: HTMLElement; upload: (file: File) => void }
const targets = new Set<DropTarget>()
const visible = (element: HTMLElement) =>
  element.isConnected &&
  element.getClientRects().length > 0 &&
  getComputedStyle(element).visibility !== 'hidden'

/** 一组全页监听器：优先拖入的上传区，其次当前弹窗，最后单一页面上传区。 */
function resolveTarget(event: DragEvent) {
  const element = event.target instanceof Element ? event.target : null
  const dialogs = Array.from(
    document.querySelectorAll<HTMLElement>('.ant-modal-wrap, .ant-drawer'),
  ).filter(visible)
  // antd 弹层按 z-index 排序；同层以最后挂载的弹窗优先。
  const dialog = dialogs
    .sort(
      (a, b) =>
        (Number.parseInt(getComputedStyle(a).zIndex) || 0) -
        (Number.parseInt(getComputedStyle(b).zIndex) || 0),
    )
    .at(-1)
  const candidates = [...targets].filter(
    ({ element }) => visible(element) && (!dialog || dialog.contains(element)),
  )
  const direct = candidates.find(
    (target) => element && target.element.contains(element),
  )
  if (direct) return direct
  // 其他控件的文件拖放（如工作流导入）不交给页面图片上传区。
  if (element?.closest('input, textarea, .ant-upload')) return undefined
  return candidates.length === 1 ? candidates[0] : undefined
}
const isFiles = (event: DragEvent) =>
  event.dataTransfer?.types.includes('Files')
const dragOver = (event: DragEvent) => {
  if (!isFiles(event)) return
  event.preventDefault()
  if (resolveTarget(event) && event.dataTransfer)
    event.dataTransfer.dropEffect = 'copy'
}
const drop = (event: DragEvent) => {
  if (!isFiles(event)) return
  // 阻止浏览器打开文件；只在明确目标时消费事件。
  event.preventDefault()
  const target = resolveTarget(event)
  if (!target) return
  event.stopPropagation()
  for (const file of Array.from(event.dataTransfer?.files || []))
    if (file.type.startsWith('image/')) target.upload(file)
}

export function registerImageDropTarget(target: DropTarget) {
  if (!targets.size) {
    window.addEventListener('dragover', dragOver, true)
    window.addEventListener('drop', drop, true)
  }
  targets.add(target)
  return () => {
    targets.delete(target)
    if (!targets.size) {
      window.removeEventListener('dragover', dragOver, true)
      window.removeEventListener('drop', drop, true)
    }
  }
}
