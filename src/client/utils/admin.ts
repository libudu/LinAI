// 管理员判定：仅本地运行（localhost）且 localStorage 中存在 admin 标记
export const isAdmin = () => {
  return (
    window.location.hostname === 'localhost' && !!localStorage.getItem('admin')
  )
}
