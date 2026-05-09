import { Image, message } from 'antd'
import copy from 'copy-to-clipboard'
import QRCodeImg from '../../../assets/image/qrcode.jpg'
import { MessageList } from './MessageList'

const ImportantContent = () => {
  return (
    <div className="text-sm">
      <MessageList
        messages={[
          {
            icon: '✨',
            content: (
              <>
                <span className="font-bold text-gray-900">功能特点：</span>
                <div>开源：可以二次开发，没有魔法，没有黑箱，没有小动作</div>
                <div>
                  慈善：无广告，无抽成，价格极低
                  <span className="text-gray-500">
                    （甚至倒贴钱给大家免费 API KEY）
                  </span>
                </div>
                <div>
                  画质：支持 2k、4k 图，支持 high
                  画质，支持常用比例，支持一次多张
                </div>
                <div>
                  任务编排：创建模板不需要重复上传图片，可以同时提交等待多个任务
                </div>
              </>
            ),
          },
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
        ]}
      />
      <div className="flex flex-col items-center">
        <div className="mb-1 text-lg text-gray-600">
          ☕ 感谢赞助支持，可以备注你的昵称
        </div>
        <div className="flex items-center justify-center rounded-md bg-gray-200 p-2">
          <Image src={QRCodeImg} alt="赞助二维码" width={180} />
        </div>
      </div>
    </div>
  )
}

export default ImportantContent
