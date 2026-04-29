import axios from 'axios'
import { logger } from '../utils/logger'
import { wanAuthManager } from './auth'
import { config } from './config'
import type { ImageGenResponse, PagingListResponse } from './types'

export class WanxClient {
  private async getHeaders() {
    const session = await wanAuthManager.getSessionToken()
    return {
      'content-type': 'application/json',
      Cookie: `WANX_CN_SESSION=${session}`,
    }
  }

  async getTaskList(pageSize = 10): Promise<PagingListResponse> {
    try {
      const headers = await this.getHeaders()
      const response = await axios.post<PagingListResponse>(
        `${config.BASE_URL}/v2/task/pagingList`,
        { pageSize, mediaType: 'all' },
        { headers },
      )
      return response.data
    } catch (error: any) {
      if (error.response?.status === 401) {
        logger.warn('⚠️ 凭证已失效，尝试刷新...')
        await wanAuthManager.refreshSession()
        return this.getTaskList(pageSize)
      }
      logger.error('❌ 获取任务列表失败:', error.message)
      throw error
    }
  }

  async submitTask(): Promise<ImageGenResponse> {
    try {
      const headers = await this.getHeaders()
      const response = await axios.post<ImageGenResponse>(
        `${config.BASE_URL}/imageGen`,
        config.SUBMIT_PAYLOAD,
        { headers },
      )
      return response.data
    } catch (error: any) {
      if (error.response?.status === 401) {
        logger.warn('⚠️ 凭证已失效，尝试刷新...')
        await wanAuthManager.refreshSession()
        return this.submitTask()
      }
      if (error.response && error.response.status === 429) {
        return error.response.data
      }
      logger.error('❌ 提交任务失败:', error.message)
      throw error
    }
  }
}
