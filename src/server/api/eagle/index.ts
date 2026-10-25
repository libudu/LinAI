import { Hono } from 'hono'
import libraryApi from './library'
import { createOrganizeApi } from './organize'

const eagleApi = new Hono()
  .route('/organize/image', createOrganizeApi('image'))
  .route('/organize/video', createOrganizeApi('video'))
  .route('/', libraryApi)

export default eagleApi
