import { dataPath } from '../../common/storage/data-path'
import { storageRegistry } from '../../common/storage/registry'

/**
 * 小说通用存储资源注册（novel.books）。
 * 章节/文本业务修改与摘要计算全部在前端，一次读改写整体保存；
 * 后端只保存整个实体、检查 revision 和维护信封元数据
 */

storageRegistry.register('novel.books', {
  kind: 'entity',
  dir: dataPath('novels', 'books'),
})
