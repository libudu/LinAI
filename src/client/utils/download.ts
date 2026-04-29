import { saveAs } from 'file-saver'
import JSZip from 'jszip'

const getSafeFileName = (fileName: string) => {
  return fileName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 30)
}

const getExtension = (url: string) => {
  return url.split('.').pop() || 'png'
}

export const downloadFile = async (url: string, fileName: string) => {
  const response = await fetch(url)
  const blob = await response.blob()
  const safeName = getSafeFileName(fileName)
  const ext = getExtension(url)
  saveAs(blob, `${safeName}.${ext}`)
}

export const downloadFilesZip = async (
  files: { url: string; fileName: string; id: string }[],
  zipName: string,
) => {
  const zip = new JSZip()
  await Promise.all(
    files.map(async (file, index) => {
      try {
        const response = await fetch(file.url)
        const blob = await response.blob()
        const safeName = getSafeFileName(file.fileName)
        const ext = getExtension(file.url)
        zip.file(`${safeName}_${index}.${ext}`, blob)
      } catch (error) {
        console.error(`下载任务 ${file.id} 失败`, error)
      }
    }),
  )
  const content = await zip.generateAsync({ type: 'blob' })
  saveAs(content, `${zipName}.zip`)
}
