/**
 * 设置注册汇总：服务端启动时执行一次（由 api/common/settings.ts 引用触发）。
 * 各模块在自己的 module/<模块>/settings.ts 中定义 schema/默认值/密钥策略并注册；
 * 新增后端消费的配置时在此追加导入即可
 */
import '../../module/gpt-image/settings'
import '../../module/novel/settings'
import '../../module/tts/settings'
import '../../module/vision/settings'
