import { Hono } from 'hono'
import libraryApi from './library'
import organizeApi from './organize'

const eagleApi = new Hono()
  .route('/organize', organizeApi)
  .route('/', libraryApi)

export default eagleApi
