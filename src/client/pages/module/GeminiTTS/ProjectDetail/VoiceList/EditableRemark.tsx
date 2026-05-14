import { Input } from 'antd'
import React, { useEffect, useRef, useState } from 'react'

interface EditableRemarkProps {
  value: string
  onChange: (val: string) => void
}

export const EditableRemark: React.FC<EditableRemarkProps> = ({
  value,
  onChange,
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [tempValue, setTempValue] = useState(value)
  const inputRef = useRef<any>(null)

  useEffect(() => {
    setTempValue(value)
  }, [value])

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
    }
  }, [isEditing])

  const handleBlur = () => {
    setIsEditing(false)
    if (tempValue !== value) {
      onChange(tempValue)
    }
  }

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        size="small"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleBlur}
        onPressEnter={handleBlur}
        placeholder="请输入备注"
        className="h-7 text-xs!"
      />
    )
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className="line-clamp-1 flex h-7 cursor-pointer items-center rounded px-1 text-xs break-all text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-800"
      title="点击输入备注"
    >
      {value ? value : <span className="text-gray-400">点击输入备注</span>}
    </div>
  )
}
