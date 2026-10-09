/** Eagle 公共业务门面；可变索引、扫描工具与缓存脏标记仅在 library 内部使用。 */
export { convertHeifItem, getConversionCandidates } from './conversion'
export { refreshIndex } from './index-state'
export {
  deleteItem,
  purgeItem,
  purgeTrash,
  restoreItem,
  trashUnclassified,
  updateFolder,
  updateItem,
  updateItems,
} from './operations'
export {
  findFolderIdByPath,
  folderExists,
  getClassifiableItems,
  getFolderPaths,
  getFolderStandards,
  getFolderTree,
  getItemDetail,
  getItemMediaSource,
  getItemPresence,
  getItemSnapshots,
  getItems,
  getLibraryChanges,
  getLibraryOverview,
} from './query'
export { isVideoExt } from './runtime'
export type {
  EagleItemDetail,
  EagleItemMediaSource,
  EagleItemSnapshot,
  GetItemsParams,
  UpdateItemBatchEntry,
  UpdateItemPatch,
  UpdateItemResult,
} from './types'
export {
  readVideoContactSheet,
  saveVideoContactSheet,
} from './video-contact-sheet'
