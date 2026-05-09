import { MessageItem, MessageList } from './MessageList'

const ErrorContent = () => {
  const errorMessages: MessageItem[] = [
    {
      icon: '🚦',
      content: (
        <>
          <span className="font-bold text-red-400">中转站拥塞：</span>
          API
          中转服务偶遇网络波动或请求拥堵时可能会出现报错。请仔细阅读具体报错信息，若因访问量过大导致，稍等片刻后重试即可恢复。
        </>
      ),
    },
    {
      icon: '🔍',
      content: (
        <>
          <span className="font-bold text-red-400">内容审查：</span>
          模型服务方会对输入数据和生成结果进行审查，包含敏感内容可能导致生成失败，具体以报错信息为准
        </>
      ),
    },
    {
      icon: '🔌',
      content: (
        <>
          <span className="font-bold text-red-400">连接丢失：</span>
          如果在图片结果返回前关闭终端窗口会导致等待中的任务连接丢失，无法再获取生成结果
        </>
      ),
    },
  ]

  return <MessageList messages={errorMessages} />
}

export default ErrorContent
