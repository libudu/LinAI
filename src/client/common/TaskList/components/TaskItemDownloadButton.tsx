import { DownloadOutlined } from '@ant-design/icons'
import { Button, message, Tooltip } from 'antd'
import { downloadFile } from '../../../utils/download'

export const TaskItemDownloadButton = ({
  outputUrl,
  fileName,
  onDownloaded,
}: {
  outputUrl: string
  fileName: string
  onDownloaded: () => void
}) => {
  const handleDownload = async () => {
    try {
      await downloadFile(outputUrl, fileName)
      onDownloaded()
      message.success('下载完成')
    } catch (err) {
      message.error('下载失败')
    }
  }

  return (
    <Tooltip title="下载">
      <Button
        type="text"
        icon={<DownloadOutlined />}
        onClick={() => handleDownload()}
      />
    </Tooltip>
  )
}
