import { message } from 'antd'
import copy from 'copy-to-clipboard'
import { MessageList } from './MessageList'

const upgradeHistory = [
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
