/**
 * 中继目标注册汇总：注册定义在各模块的 relay.ts（与 settings 同一模式），
 * 此处仅做副作用导入，由 api/common/relay.ts 引用触发。
 * 新增允许代理的外部服务时，在所属模块新建/编辑 relay.ts 并在此加一行导入；
 * 带文件副作用或业务预处理的请求不进中继。
 */
import '../../module/novel/relay'
import '../../module/tts/relay'
