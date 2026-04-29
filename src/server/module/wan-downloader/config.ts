import dotenv from 'dotenv'
dotenv.config()

export const config = {
  SESSION: process.env.WANX_CN_SESSION || '',
  BASE_URL: 'https://wanx.biz.aliyun.com/wanx/api/common',
  POLL_INTERVAL: 10 * 60 * 1000,
  MAX_IN_PROGRESS: 3,
  DOWNLOAD_DIR: './data/wan',
  RECORD_FILE: './data/logs/records.json',
  USER_DATA_DIR: './data/wan/.user_data',
  EXPLORE_URL: 'https://tongyi.aliyun.com/wan/explore',
  START_TIME: new Date('2036-04-17 00:00:00 GMT+0800').getTime(),
  SUBMIT_PAYLOAD: {
    deductMode: 'relax_mode',
    taskType: 'image_to_video',
    taskInput: {
      modelVersion: '2_7',
      duration: 15,
      assistInfo: '{}',
      prompt:
        '皇帝畅快地从完全昏迷的金身武僧口中吸取内力。武僧身体微微颤抖。随着内力被逐渐吸干，武僧的身体变得干瘪脱水萎缩。皇帝畅快地呼出一口气，与武僧嘴对嘴亲一口，然后说：“你的内力终于是我的了”，最后是皇帝得意而略带阴险的正脸特写。整体画面采用暗黑武侠风格，近景特写，强调内力流动和人物表情。带有悲怆和危机的背景音乐，以及微弱的内力流动的声音。',
      generationMode: 'plain',
      baseImage:
        'https://cdn.wanx.aliyuncs.com/upload/5231657482591727577/unknown/83d2bceb1a904a19bff840f0c6a9acfd1776277295916.jpg?x-oss-process=image/resize,w_500/format,webp',
      selectedResolution: '1080P',
      multiShots: 'single',
      subType: 'basic',
      parentTaskId: '',
    },
  },
}
