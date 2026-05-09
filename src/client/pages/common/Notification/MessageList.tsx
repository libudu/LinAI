import { ReactNode } from 'react'

export interface MessageItem {
  icon: ReactNode
  content: ReactNode
  hidden?: boolean
}

export interface MessageListProps {
  messages: MessageItem[]
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <div className="mb-2 space-y-1 sm:space-y-2">
      {messages
        .filter((msg) => !msg.hidden)
        .map((msg, index) => (
          <div key={index} className="flex items-start">
            <span className="mr-3 text-xl">{msg.icon}</span>
            <div className="leading-relaxed">{msg.content}</div>
          </div>
        ))}
    </div>
  )
}
