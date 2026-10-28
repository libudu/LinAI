import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getDefaultLibraryPath } from '../../module/eagle/library-path'
import { getEagleSettings } from '../../module/eagle/settings'
import { proxySharedRead } from '../../module/eagle/sharing/transport'
import libraryApi from './library'
import { createOrganizeApi } from './organize'
import sharingApi from './sharing'

const eagleApi = new Hono()
  .get('/default-library-directory', (c) =>
    c.json({ success: true as const, data: { path: getDefaultLibraryPath() } }),
  )
  .route('/sharing', sharingApi)
  .use('*', async (c, next) => {
    if ((await getEagleSettings()).libraryMode !== 'remote') return next()
    const path = c.req.path.replace(/^\/api\/eagle/, '')
    if (path === '/refresh' && c.req.method === 'POST') {
      // 远程刷新只重新加载共享方当前快照，不允许触发对方写入索引。
      return c.json({ success: true as const, data: null })
    }
    if (c.req.method !== 'GET')
      throw new HTTPException(403, { message: '远程共享资源库不能编辑或删除' })
    return proxySharedRead(path, c.req.raw)
  })
  .route('/organize/image', createOrganizeApi('image'))
  .route('/organize/video', createOrganizeApi('video'))
  .route('/', libraryApi)

export default eagleApi
