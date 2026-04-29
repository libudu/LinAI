import { Image, Modal, Tabs, message } from 'antd'
import copy from 'copy-to-clipboard'
import { createRoot } from 'react-dom/client'
import QRCodeImg from '../../assets/image/qrcode.jpg'
import { useGlobalStore } from '../../store/global'
import { MessageItem, MessageList } from './MessageList'

export function openNotificationModal() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  function destroy() {
    root.unmount()
    if (container.parentNode) {
      container.parentNode.removeChild(container)
    }
  }

  function ModalComponent() {
    const localNetworkUrl = useGlobalStore((state) => state.localNetworkUrl)

    const importantMessages: MessageItem[] = [
      {
        icon: '🛡️',
        content: (
          <>
            <span className="font-bold text-gray-900">数据隐私：</span>
            本工具后端在用户本地运行，本身无任何第三方数据收集。仅在您使用开发者分享的
            API Key 时，开发者能在 API
            平台查看基本开销日志，不包含提示词或上传的图片等隐私内容。
          </>
        ),
      },
      {
        icon: '⚠️',
        content: (
          <>
            <span className="font-bold text-gray-900">充值建议：</span>
            本工具对接第三方平台服务，存在不可控因素。为保障您的资金安全，建议单次充值金额不超过
            10 元，单张 2k medium 仅 0.04 元左右，日常使用额度完全够用。
          </>
        ),
      },
      {
        icon: '💬',
        content: (
          <>
            <span className="font-bold text-gray-900">工具交流群：</span>
            <span
              className="cursor-pointer font-medium text-blue-500 underline hover:text-blue-600"
              onClick={() => {
                copy('1098503823')
                message.success('群号已复制')
              }}
            >
              1098503823
            </span>
          </>
        ),
        hidden: import.meta.env.VITE_IS_PUBLIC === 'true',
      },
    ]

    const tipsMessages: MessageItem[] = [
      {
        icon: '🔄',
        content: (
          <>
            <span className="font-bold text-gray-900">快速升级：</span>
            将新版本压缩包直接拖放至“版本迁移”批处理（.bat）脚本上，即可保留用户数据的同时自动完成版本升级。
          </>
        ),
      },
      {
        icon: '🎨',
        content: (
          <>
            <span className="font-bold text-gray-900">提示词技巧：</span>
            部分模型的文字审查机制较为严格（如 GPT Image
            2），建议优先采用“上传图片作为参考”的方式进行生成，以提高成功率。
          </>
        ),
      },
      {
        icon: '📦',
        content: (
          <>
            <span className="font-bold text-gray-900">存储优化：</span>
            为节省磁盘空间，上传的图片在本地存储时将自动压缩为 WebP
            格式。您可以在系统设置中对此功能进行个性化配置。
          </>
        ),
      },
      {
        icon: '🌐',
        content: (
          <>
            <span className="font-bold text-gray-900">局域网访问：</span>
            相同局域网下，其他设备（如移动端）可以通过访问内网地址来使用本服务：
            <span
              className="cursor-pointer font-medium text-blue-500 underline hover:text-blue-600"
              onClick={() => {
                if (!localNetworkUrl) {
                  return
                }
                copy(localNetworkUrl)
                message.success('内网地址已复制')
              }}
            >
              {localNetworkUrl}
            </span>
          </>
        ),
        hidden: !localNetworkUrl,
      },
    ]

    const errorMessages: MessageItem[] = [
      {
        icon: '⚠️',
        content: (
          <>
            <span className="font-bold text-gray-900">中转站拥塞：</span>
            API
            中转服务偶遇网络波动或请求拥堵时可能会出现报错。请仔细阅读具体报错信息，若因访问量过大导致，稍等片刻后重试即可恢复。
          </>
        ),
      },
      {
        icon: '⚠️',
        content: (
          <>
            <span className="font-bold text-gray-900">内容审查：</span>
            模型服务方会对输入数据和生成结果进行审查，包含敏感内容可能导致生成失败，具体以报错信息为准
          </>
        ),
      },
    ]

    const items = [
      {
        key: 'important',
        label: '📢 重要说明',
        children: (
          <div>
            <MessageList messages={importantMessages} />
            <div className="flex flex-col items-center">
              <div className="mb-1 text-lg text-gray-600">
                ☕ 感谢赞助支持，可以备注你的昵称
              </div>
              <div className="flex items-center justify-center rounded-md bg-gray-200 p-2">
                <Image src={QRCodeImg} alt="赞助二维码" width={200} />
              </div>
            </div>
          </div>
        ),
      },
      {
        key: 'tips',
        label: '💡 高级技巧',
        children: <MessageList messages={tipsMessages} />,
      },
      {
        key: 'errors',
        label: '🚨 错误提示',
        children: <MessageList messages={errorMessages} />,
      },
    ]

    return (
      <Modal
        title={
          <span className="flex items-center gap-2 text-xl font-semibold">
            <span>🔔</span> 通知与说明
          </span>
        }
        open={true}
        onCancel={destroy}
        footer={null}
        destroyOnHidden
        width={650}
      >
        <div className="min-h-[350px]">
          <Tabs
            items={items}
            defaultActiveKey="important"
            size="large"
            className="px-2 py-4 text-sm text-gray-700 sm:text-base!"
          />
        </div>
      </Modal>
    )
  }

  root.render(<ModalComponent />)
}
