# 图片生成模块（GenImage）

本目录是 LinAI 图片生成首页的前端实现，页面注册在 `src/client/routes.tsx` 的 `/` 路由。页面由模板表单与列表、生成任务列表组成；生图接入点、视觉接入点和界面偏好通过设置弹窗管理。这里不直接持久化任务或生成图片，相关写入由服务端负责。

## 目录与职责

| 位置                                                             | 职责                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `index.tsx`                                                      | 组合 `TemplateSection` 和 `TaskList`。                                               |
| `TemplateSection/TemplateForm/`                                  | 新建模板、试生成、参考图上传，以及裁剪、绘制、图库、提示词优化和风格提取等表单功能。 |
| `TemplateSection/TemplateList/`、`TemplateSection/TemplateItem/` | 模板与文件夹展示、编辑、重命名、删除和按模板生成。                                   |
| `service/templates.ts`、`TemplateSection/hooks/useTemplates.ts`  | `image.templates` 集合的前端业务封装和列表缓存。                                     |
| `TaskList/`、`hooks/useTasks.ts`                                 | 查询任务、订阅变更、展示状态与图片，以及重试、下载和删除。                           |
| `SettingModal/`                                                  | 生图接入点、视觉接入点、云端生图选项、图片目录和辅助功能设置。                       |
| `store.ts`                                                       | 生图接入点的服务端设置镜像与修订号；保存时整体提交。                                 |
| `visionStore.ts`                                                 | 提示词优化和风格提取使用的视觉接入点设置。                                           |
| `hooks/useGPTImageQuota.ts`                                      | 云端接入点余额查询与缓存；ComfyUI 模式不查询。                                       |
| `components/ImageGenerateDropdown.tsx`                           | 云端生成尺寸菜单；ComfyUI 模式为单个“生成”按钮。                                     |

## 数据放在哪里

| 数据                                         | 所有者与位置                                                                                                                      | 前端入口                                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 图片模板、文件夹                             | 通用存储资源 `image.templates`，服务端文件 `data/templates.json`；类型见 `src/shared/image/template.ts`。                         | `service/templates.ts`，不要直接拼存储信封。                                                                |
| 生图接入点、API Key、ComfyUI 工作流引用      | SettingsRegistry 的 `gpt-image` 设置，服务端文件 `data/images/config.json`；schema 见 `src/server/module/gpt-image/settings.ts`。 | `store.ts` 经 `settingsClient` 读写；`SettingModal/Endpoint/useEndpointActions.ts` 组织一次保存所需的字段。 |
| 视觉接入点、API Key                          | SettingsRegistry 的 `vision` 设置，服务端文件 `data/vision/config.json`；与生图接入点独立。                                       | `visionStore.ts`、`SettingModal/VisionEndpoint/`。                                                          |
| ComfyUI 工作流 JSON                          | 服务端 `data/images/workflows/<workflowId>.json`，不放进设置值或每次生成请求。                                                    | `POST /api/gptImage/comfyui/import` 专用导入接口。                                                          |
| 任务、状态、输入快照                         | 服务端 `TaskService`，文件 `data/tasks.json`；任务不是前端可写的通用存储资源。                                                    | `GET /api/task`、`DELETE /api/task/:id`；`hooks/useTasks.ts` 订阅 `image.tasks` 变更事件后重新拉取。        |
| 输入图、生成图                               | 服务端 `data/images/input/`、`data/images/generated/`。                                                                           | 上传接口返回 `/api/static/images/input/...`；任务输出为 `/api/static/images/generated/...`。                |
| 尺寸开关、画质、删除任务时保留图片等界面偏好 | 浏览器 `localStorage` 的 `gpt-image-settings`。                                                                                   | `src/client/hooks/useLocalSetting.tsx`。这些值不是服务端接入点配置。                                        |
| 最近使用的输入图                             | 浏览器 `localStorage` 的 `recent_uploaded_images`。                                                                               | `TemplateSection/hooks/useRecentImages.ts`。                                                                |

模板与任务各有一份输入数据：生成时前端提交本次生成所需的模板输入，服务端把它写入任务的 `inputSnapshot`。之后修改或删除模板，不会改动历史任务的输入。模板可以保存多张参考图；选中 ComfyUI 时，**生成和试生成必须恰好使用一张**，前后端都会检查。

## 生成流程

1. `TemplateForm` 负责试生成，`TemplateItemHeader` 负责按已保存模板生成；两者分别调用 `POST /api/gptImage/trial` 和 `POST /api/gptImage/generate`。
2. 服务端路由 `src/server/api/gpt-image/index.ts` 按当前接入点类型分发。云端接入点走 `src/server/module/gpt-image/index.ts`；ComfyUI 走 `src/server/module/gpt-image/comfyui.ts`。不要只凭 Base URL 或模型 ID 猜测协议。
3. 云端分支使用 API Key、模型、尺寸、画质等参数。ComfyUI 分支只把提示词和一张参考图送入工作流，不使用模板比例、尺寸、画质、张数或“比例拼接”文案。
4. ComfyUI 提交接口创建任务后尽快返回 `taskId`，后台上传参考图、提交 `/prompt`、按 `prompt_id` 轮询 `/history`，再从标记的最终输出节点下载图片。云端生成仍沿用原有请求流程。
5. 任务由 `TaskService` 流转 `pending → running → completed/failed`，并发布 `image.tasks` 事件。`useTasks` 收到事件后重新请求任务列表；`TaskList` 展示运行、失败和输出图片，下载与删除使用服务端保存的图片，不依赖 ComfyUI 保留原文件。

任务列表只展示来源为 `gpt-image-2` 或 `comfyui` 的任务。ComfyUI 任务不展示未实际使用的比例、尺寸和画质标签。重试使用任务的输入快照；ComfyUI 重试还使用任务记录的接入点 ID，并读取该接入点当前引用的最新版工作流。原接入点或工作流已删除时应明确报错，不能改用当前云端接入点。

## 接入点与工作流

生图接入点设置在 `SettingModal/Endpoint/`：`EndpointSetting.tsx` 管理表单展示，`useEndpointActions.ts` 管理保存、删除和工作流导入，`endpointPresets.tsx` 管理预设的前端说明和下拉值。`store.ts` 的 `saveConfig` 一次提交完整设置并使用 revision 检测冲突；不要把一次接入点操作拆成多次设置写入。共享类型和预设定义位于 `src/shared/gpt-image/endpoints.ts`。

ComfyUI 只允许本机 HTTP 回环地址，规则统一在 `src/shared/gpt-image/comfyui.ts`。导入必须使用 **ComfyUI API 格式 JSON**，并有三个必需的 `_meta.title` 标记；标题匹配忽略大小写和首尾空格：

| 节点标题       | 用途                                                       |
| -------------- | ---------------------------------------------------------- |
| `LinAI@prompt` | `inputs.prompt` 每次替换为用户提示词。                     |
| `LinAI@image1` | `inputs.image` 每次替换为上传到 ComfyUI 的参考图文件名。   |
| `LinAI@output` | 从该节点的 `history.outputs[节点ID].images` 读取最终图片。 |
| `LinAI@seed`   | 可选；每次提交前将 `inputs.seed` 替换为随机整数。         |

导入与节点校验在 `src/server/module/gpt-image/comfyui-workflow.ts`；节点 ID 从导入文件扫描，不能写死。任务执行在同目录 `comfyui.ts`，每个任务复制工作流后再替换输入，不能修改磁盘模板或共用对象。最终输出要保存到 LinAI 的生成图目录。工作流更详细的约定见 `docs/comfyui/本地工作流接入生图实现方案.md`。

## 修改时从哪里入手

| 需求                         | 主要入口                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 改模板字段、文件夹或列表操作 | `src/shared/image/template.ts`、`service/templates.ts`、`TemplateSection/`；核对任务快照和旧模板兼容性。                                                  |
| 改参考图上传、图库或图片编辑 | `TemplateSection/TemplateForm/ImageUpload.tsx` 及相邻 `Gallery/`、`ImageCrop/`、`ImageDraw/`；核对服务端静态图片目录与上传接口。                          |
| 增加或修改接入点配置         | `src/shared/gpt-image/endpoints.ts`、`src/server/module/gpt-image/settings.ts`、`store.ts`、`SettingModal/Endpoint/`；后端消费的字段走 SettingsRegistry。 |
| 改云端生图参数               | `src/server/api/gpt-image/index.ts`、`src/server/module/gpt-image/generate.ts`、`TemplateForm/`、`components/ImageGenerateDropdown.tsx`。                 |
| 改 ComfyUI 工作流约定或执行  | `src/server/module/gpt-image/comfyui-workflow.ts`、`comfyui.ts`、`src/shared/gpt-image/comfyui.ts`；保留单图校验、任务隔离和输出清理。                    |
| 改任务展示或重试             | `TaskList/`、`hooks/useTasks.ts`、`src/server/common/task/`；继续复用 `TaskService` 和 `image.tasks` 事件。                                               |
| 改余额或侧栏接入点展示       | `hooks/useGPTImageQuota.ts`、`src/client/pages/common/Sidebar/EndpointDisplay.tsx`；ComfyUI 不应触发云端余额请求。                                        |

开发遵循仓库根目录 `AGENTS.md`：依赖用 pnpm，不运行 build 或 eslint；代码完成后用 `npx tsc --noEmit` 做类型检查。除非另有要求，不使用视觉能力验证。
