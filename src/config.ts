import dotenv from "dotenv";
dotenv.config();

export const config = {
  SESSION: process.env.WANX_CN_SESSION || "",
  BASE_URL: "https://wanx.biz.aliyun.com/wanx/api/common",
  POLL_INTERVAL: 10 * 60 * 1000,
  MAX_IN_PROGRESS: 3,
  DOWNLOAD_DIR: "./downloads",
  LOG_DIR: "./logs",
  RECORD_FILE: "./logs/records.json",
  LOG_FILE: "./logs/app.log",
  USER_DATA_DIR: "./.user_data",
  EXPLORE_URL: "https://tongyi.aliyun.com/wan/explore",
  START_TIME: new Date("2026-04-16 12:00:00").getTime(), // 默认从今天开始
  SUBMIT_PAYLOAD: {
    deductMode: "relax_mode",
    taskType: "image_to_video",
    taskInput: {
      modelVersion: "2_7",
      duration: 15,
      assistInfo: "{}",
      prompt:
        "镜头固定，画面中皇帝畅快地从金身武僧口中吸取内力。武僧身体微微颤抖，手下意识抓紧。随着内力被逐渐吸干，武僧的身体变得干瘪脱水萎缩。最后，皇帝畅快地呼出一口气，与武僧嘴对嘴，武僧瘫软在床上颤抖无力地发出“唔嗯”的声音。整体画面采用暗黑武侠风格，近景特写，强调内力流动和人物表情。带有悲怆和危机的背景音乐，以及微弱的内力流动的声音。",
      promptMeta: {
        originPrompt:
          "镜头固定，画面中皇帝畅快地从金身武僧口中吸取内力。武僧身体微微颤抖，手下意识抓紧。随着内力被逐渐吸干，武僧的身体变得干瘪脱水萎缩。最后，皇帝畅快地呼出一口气，与武僧嘴对嘴，武僧瘫软在床上颤抖无力地发出“唔嗯”的声音。整体画面采用暗黑武侠风格，近景特写，强调内力流动和人物表情。带有悲怆和危机的背景音乐，以及微弱的内力流动的声音。",
        orderedKeys: [],
        refs: {},
      },
      generationMode: "plain",
      baseImage:
        "https://cdn.wanx.aliyuncs.com/upload/5231657482591727577/unknown/83d2bceb1a904a19bff840f0c6a9acfd1776277295916.jpg?x-oss-process=image/resize,w_500/format,webp",
      selectedResolution: "1080P",
      multiShots: "single",
      subType: "basic",
      parentTaskId: "",
    },
  },
};
