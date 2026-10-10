/** 媒体编辑保存的进度；100% 仅在文件与索引提交完成后返回。 */
export interface EagleMediaEditSaveProgress {
  percent: number
  phase: 'queued' | 'encoding' | 'verifying' | 'backup' | 'committing'
  canCancel: boolean
}
