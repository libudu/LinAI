/** Eagle 写操作门面：按文件夹、条目编辑和回收站职责拆分。 */
export { updateFolder } from './folder-operations'
export { updateItem, updateItems } from './item-operations'
export {
  deleteItem,
  purgeItem,
  purgeTrash,
  restoreItem,
  trashUnclassified,
} from './trash-operations'
