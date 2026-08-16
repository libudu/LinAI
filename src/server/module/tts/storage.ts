import { dataPath } from '../../common/storage/data-path'
import { storageRegistry } from '../../common/storage/registry'

/**
 * TTS 项目通用存储资源注册（tts.projects）。
 * 角色/对白/备注的增删改全部由前端完成，然后整体保存项目
 */

storageRegistry.register('tts.projects', {
  kind: 'entity',
  dir: dataPath('tts', 'projects'),
})
