type ModalDropTarget = {
  element: HTMLElement
  dropFiles: (files: File[], skippedCount: number) => void
  setDragging: (dragging: boolean) => void
}
type DropTarget =
  | { element: HTMLElement; upload: (file: File) => void }
  | ModalDropTarget

const targets = new Set<DropTarget>()
let draggingTarget: ModalDropTarget | undefined

const isModalTarget = (target: DropTarget): target is ModalDropTarget =>
  'dropFiles' in target
const visible = (element: HTMLElement) =>
  element.isConnected &&
  element.getClientRects().length > 0 &&
  getComputedStyle(element).visibility !== 'hidden'

/** 一组全页监听器：弹窗可独占拖放，否则优先拖入的上传区。 */
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
  const modalTarget = dialog && candidates.find(isModalTarget)
  if (modalTarget) return modalTarget

  const uploads = candidates.filter((target) => !isModalTarget(target))
  const direct = uploads.find(
    (target) => element && target.element.contains(element),
  )
  if (direct) return direct
  // 其他控件的文件拖放（如工作流导入）不交给页面图片上传区。
  if (element?.closest('input, textarea, .ant-upload')) return undefined
  return uploads.length === 1 ? uploads[0] : undefined
}

const isFiles = (event: DragEvent) =>
  event.dataTransfer?.types.includes('Files')

const isImage = (type: string) => type.startsWith('image/')

function setDraggingTarget(target?: ModalDropTarget) {
  if (draggingTarget === target) return
  draggingTarget?.setDragging(false)
  draggingTarget = target
  target?.setDragging(true)
}

const dragOver = (event: DragEvent) => {
  const transfer = event.dataTransfer
  if (!transfer || !isFiles(event)) return
  event.preventDefault()
  const target = resolveTarget(event)
  if (target && isModalTarget(target)) {
    event.stopPropagation()
    const items = Array.from(transfer.items)
    const acceptsImages =
      items.length === 0 ||
      items.some(
        (item) => item.kind === 'file' && (!item.type || isImage(item.type)),
      )
    // 允许落下整批文件，以便图库报告筛选时跳过的数量。
    transfer.dropEffect = 'copy'
    setDraggingTarget(acceptsImages ? target : undefined)
    return
  }
  setDraggingTarget()
  if (target) transfer.dropEffect = 'copy'
}

const clearDragging = () => setDraggingTarget()
const dragLeave = (event: DragEvent) => {
  if (!event.relatedTarget) clearDragging()
}

const drop = (event: DragEvent) => {
  clearDragging()
  if (!isFiles(event)) return
  // 阻止浏览器打开文件；只在明确目标时消费事件。
  event.preventDefault()
  const target = resolveTarget(event)
  if (!target) return
  event.stopPropagation()
  const droppedFiles = Array.from(event.dataTransfer?.files ?? [])
  const files = droppedFiles.filter((file) => isImage(file.type))
  if (isModalTarget(target)) {
    if (droppedFiles.length) {
      target.dropFiles(files, droppedFiles.length - files.length)
    }
    return
  }
  for (const file of files) target.upload(file)
}

export function registerImageDropTarget(target: DropTarget) {
  if (!targets.size) {
    window.addEventListener('dragover', dragOver, true)
    window.addEventListener('dragleave', dragLeave, true)
    window.addEventListener('dragend', clearDragging, true)
    window.addEventListener('drop', drop, true)
  }
  targets.add(target)
  return () => {
    if (draggingTarget === target) clearDragging()
    targets.delete(target)
    if (!targets.size) {
      window.removeEventListener('dragover', dragOver, true)
      window.removeEventListener('dragleave', dragLeave, true)
      window.removeEventListener('dragend', clearDragging, true)
      window.removeEventListener('drop', drop, true)
    }
  }
}
