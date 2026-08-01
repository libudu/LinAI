import { message } from 'antd'
import copy from 'copy-to-clipboard'
import { MessageList } from './MessageList'

const upgradeHistory = [
  `LinAI v1.1.6 更新内容 🐱：
🚀 新增 GitHub Actions 自动发布流程，推送版本标签后自动构建并发布压缩包`,
  `LinAI v1.1.5 更新内容 🐱：
🖼️ 生成图片自动写入 PNG 元数据，生成参数随图保存
💴 新增 GPT 图像余额展示与端点安全提醒`,
  `LinAI v1.1.4 更新内容 🐱：
🗂️ 新增实验性图片整理模块，支持快捷键分类、多选批量标记与平滑切换动画
🔌 设置页新增接入点配置，支持自定义接入点、API Key 分组与搜索
🎨 新增实验性图片风格提取功能，可一键提取参考图风格
📐 提示词自动追加图片比例、首图自动填充比例，任务列表可显示实际尺寸
🔧 错误信息标注来源（LinAI / 云雾 / 网络），移除 Wan 视频生成模块`,
  `LinAI v1.1.3 更新内容 🐱：
🖼️ 新增图库功能，统一浏览输入图片与生成图片，支持多选与直接上传
🗑️ 图库可标记并一键删除无引用图片，替代原设置页清理入口
✨ 提示词优化弹窗支持自定义提示词模板，完善错误处理与提示`,
  `LinAI v1.1.2 更新内容 🐱：
🔊 新增实验性 TTS 语音合成模块，支持音色管理与试听、人物与对话管理、批量导出音频
🎮 支持从 Ren'Py 项目导入对话并同步生成结果回项目
✨ 新增提示词优化功能，一键优化模板提示词
📋 新增模板重新填入、删除任务保留图片选项与打开生成图片目录
🔐 API 密钥加密存储，错误信息支持一键复制`,
  `LinAI v1.1.0 更新内容 🐱：
🖼️ 支持批量生成和展示多张图像图片，可在设置中开启
📁 设置新增输入图片管理功能，可清理无引用输入图片
🛡️ GPT 图像生成审核选项改为 low，不知道有没有效果
📱 优化任务列表、模板表单、移动端的交互，优化消息通知文案`,
  `LinAI v1.0.6 更新内容 🐱：
✨ 新增了模板分类与文件夹管理功能，支持拖拽排序、移动、另存模板，新增了最近上传图片快速选择功能
✨ 更新了系统内置模板，新用户上手体验更好
🚀 优化了后端打包逻辑，减少依赖碎片，使后端产物大小大幅减少 40MB
🐛 修复了全局拖放事件因事件冒泡导致的重复触发问题`,
  `LinAI v1.0.5 更新内容 🐱：
📱初步适配移动端效果，通知增加内网地址展示
🖼️上传图片支持拖拽窗口、一键移除
📋模板和任务提示词支持点击快速复制
🐛修复删除任务时未同步删除图片、批量删除任务导致列表丢失问题
📦增加已有项目迁移方式：将新版zip包拖拽至「版本迁移」bat 文件`,
  `LinAI v1.0.4 更新内容 🐱：
🔔 新增通知模块，展示各类必要信息
⚡ 新增快速升级脚本，压缩包一键极速更新
🖼️ 设置项新增4K按钮开关 & 高清画质选择
💴 优化费用展示，完善多处说明文案
📋 任务列表标签展示比例、尺寸、画质信息
🔧 修复多项交互问题，使用更流畅`,
]

const UpgradeContent = () => {
  return (
    <div className="max-h-[400px] overflow-y-scroll">
      <MessageList
        messages={[
          ...upgradeHistory.map((item) => ({
            icon: '🔄',
            content: <div className="whitespace-break-spaces">{item}</div>,
          })),
          {
            icon: '🎁',
            content: (
              <div className="break-all">
                感谢看到这里，这是你的奖励：
                <span
                  className="cursor-pointer font-medium text-blue-500 underline hover:text-blue-600"
                  onClick={() => {
                    copy('sk-defzkFuulVnFP7SCfmlrHzEHbQw6YiwDllyjbLnpO6FOEAof')
                    message.success('API Key已复制')
                  }}
                >
                  sk-defzkFuulVnFP7SCfmlrHzEHbQw6YiwDllyjbLnpO6FOEAof
                </span>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}

export default UpgradeContent
