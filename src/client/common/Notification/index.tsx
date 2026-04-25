import { createRoot } from 'react-dom/client'
import { Modal, Tabs, Typography } from 'antd'

const { Paragraph, Text } = Typography

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
    const items = [
      {
        key: 'important',
        label: '重要说明',
        children: (
          <div className="py-2 px-4">
            <Typography>
              <Paragraph>
                <ul>
                  <li>
                    项目纯本地，没有第三方，看不到任何你上传的图片内容，仅当你使用我提供的
                    api_key 时我能在后台看到开销日志。
                  </li>
                  <li>
                    对接的是第三方平台，有可能跑路，注意信息安全，建议不要充值10元以上，本来也花不完。
                  </li>
                  <li>
                    <Text strong>工具交流群：</Text>
                    <Text copyable>1098503823</Text>
                  </li>
                </ul>
              </Paragraph>
              <div className="mt-4 flex flex-col items-center">
                <Text type="secondary" className="mb-2">
                  赞助支持
                </Text>
                <div className="w-48 h-48 bg-gray-200 flex items-center justify-center rounded-lg text-gray-400">
                  赞助二维码占位
                </div>
              </div>
            </Typography>
          </div>
        )
      },
      {
        key: 'errors',
        label: '错误提示',
        children: (
          <div className="py-2 px-4">
            <Typography>
              <Paragraph>
                api中转站服务不稳定，有可能会报错，具体看报错内容，人太多过一段时间用就行。
              </Paragraph>
            </Typography>
          </div>
        )
      },
      {
        key: 'tips',
        label: '使用技巧',
        children: (
          <div className="py-2 px-4">
            <Typography>
              <Paragraph>
                <ul>
                  <li>GPT Image 2文字审查非常严格，建议用上传图片作为参考。</li>
                  <li>上传图片存在本地会压缩为webp，可在设置中进行配置。</li>
                </ul>
              </Paragraph>
            </Typography>
          </div>
        )
      }
    ]

    return (
      <Modal
        title="通知与说明"
        open={true}
        onCancel={destroy}
        footer={null}
        destroyOnClose
        width={600}
      >
        <div className="pt-2 min-h-[300px]">
          <Tabs items={items} />
        </div>
      </Modal>
    )
  }

  root.render(<ModalComponent />)
}
