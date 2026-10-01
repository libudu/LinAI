import { changeBus } from '../storage/change-bus'
import { ResourceLock } from '../storage/resource-lock'

const lock = new ResourceLock()
/** 清理与生成提交共用短期锁，避免输入校验到任务登记之间被清理。 */
export const withImageLifecycle = <T>(operation: () => Promise<T>) =>
  lock.run('images', operation)

/** 正在写入但尚未绑定任务的输出，也必须受到图库清理保护。 */
export const activeGeneratedFiles = new Set<string>()
changeBus.register('image.assets')
export const publishImageAssetsChange = () =>
  changeBus.publish({ resource: 'image.assets' })
