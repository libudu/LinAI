/**
 * 通用存储资源注册汇总：注册定义在各模块的 storage.ts（与 settings 同一模式），
 * 此处仅做副作用导入，由 api/common/storage.ts 与 common/static 引用触发，
 * 保证服务端启动时全部注册完成。
 * 新增前端业务资源时，在所属模块新建/编辑 storage.ts 并在此加一行导入。
 */
import '../../module/gpt-image/storage'
import '../../module/novel/storage'
import '../../module/tts/storage'
