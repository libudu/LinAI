// 预设接入点（baseUrl 作为下拉值）
// 注意：此文件同时被服务端引用（src/server/common/config），不要引入前端依赖
export const ENDPOINT_PRESETS = [
  {
    label: '云雾 gpt-image-2',
    baseUrl: 'https://yunwu.ai/v1',
    modelId: 'gpt-image-2',
  },
  {
    label: '云雾 gpt-image-2c',
    baseUrl: 'https://yunwu.ai/v1',
    modelId: 'gpt-image-2c',
  },
]
