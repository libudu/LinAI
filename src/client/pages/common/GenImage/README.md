# 图片生成模块（GenImage）

本目录是 LinAI 图片生成首页的前端实现，页面注册在 `src/client/routes.tsx` 的 `/` 路由。页面由模板表单与列表、生成任务列表组成；生图接入点、视觉接入点和界面偏好通过设置弹窗管理。这里不直接持久化任务或生成图片，相关写入由服务端负责。

## 目录与职责

| 位置                                                                 | 职责                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `index.tsx`                                                          | 组合 `TemplateSection` 和 `TaskList`。                               |
| `templates/form/`                                                    | 新建模板、试生成、提示词优化和风格提取；参考图功能使用公共图片入口。 |
| `templates/list/`、`templates/items/`                                | 模板与文件夹展示、编辑、重命名、删除和按模板生成。                   |
| `src/client/service/image-templates.ts`、`templates/useTemplates.ts` | `image.templates` 集合的前端业务封装和列表缓存。                     |
| `generation/service.ts`、`generation/useImageGeneration.ts`          | 统一生成请求、参数转换和错误解析；组织配置弹窗、生成校验与结果提示。 |
| `tasks/`、`tasks/useTasks.ts`                                        | 查询任务、订阅变更、展示状态与图片，以及重试、下载和删除。           |
| `settings/`                                                          | 生图接入点、视觉接入点、云端生图选项、图片目录和辅助功能设置。       |
| `settings/store.ts`                                                  | 生图接入点的服务端设置镜像与修订号；保存时整体提交。                 |
| `settings/visionStore.ts`                                            | 提示词优化和风格提取使用的视觉接入点设置。                           |
| `settings/useGPTImageQuota.ts`                                       | 按接入点余额提供商查询与缓存；未声明余额能力时不查询。               |
| `generation/ImageGenerateDropdown.tsx`                               | 云端生成尺寸菜单；ComfyUI 模式为单个“生成”按钮。                     |

## 模块边界

前端按 `templates/`、`generation/`、`tasks/`、`settings/` 组织。图库、上传、裁剪、绘制和待使用图片位于 `src/client/features/image-assets/`，GenImage、Eagle、PerlerBead 经该目录的 `index.ts` 使用公共入口，不引用页面内部实现。模板持久化与共享缓存位于 `src/client/service/image-templates.ts`，图库通过该服务读取模板分组，避免依赖 GenImage 页面。历史任务回填状态由 `templates/draftStore.ts` 管理，不进入全局 store。

视觉配置由 `settings/visionStore.ts` 绑定 `vision` 资源，Eagle 绑定独立的 `eagle-vision` 资源；两个 store 共用 `src/client/service/vision-settings.ts` 的同步机制。接入点保存、删除与当前选择切换计算为一份 patch，只提交一次完整设置；加载前禁止保存，旧 revision 不覆盖新快照，冲突后补拉实际配置，SSE 初次连接及重连同步外部修改。

后端 `common/task/` 仅负责记录、状态流转、启动恢复和变更通知；`common/static/` 仅负责图片转换、文件和缩略图操作。`module/gpt-image/assets.ts` 编排引用检查、图库列表及清理，`module/gpt-image/tasks.ts` 编排取消执行、原子删除记录和输出清理。业务调用基础层，基础层不导入生图模块。图片接口实现位于 `api/gpt-image/assets.ts` 和 `tasks.ts`，保留 `/api/static`、`/api/task` URL；新增任务分页、摘要和按需批量操作查询接口。

## 数据放在哪里

| 数据                                         | 所有者与位置                                                                                                                      | 前端入口                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 图片模板、文件夹                             | 通用存储资源 `image.templates`，服务端文件 `data/templates.json`；类型见 `src/shared/image/template.ts`。                         | `src/client/service/image-templates.ts`，不要直接拼存储信封。                                                    |
| 生图接入点、API Key、ComfyUI 工作流引用      | SettingsRegistry 的 `gpt-image` 设置，服务端文件 `data/images/config.json`；schema 见 `src/server/module/gpt-image/settings.ts`。 | `settings/store.ts` 经 `settingsClient` 读写；`settings/Endpoint/useEndpointActions.ts` 组织一次保存所需的字段。 |
| 视觉接入点、API Key                          | SettingsRegistry 的 `vision` 设置，服务端文件 `data/vision/config.json`；与生图接入点独立。                                       | `settings/visionStore.ts`、`settings/VisionEndpoint/`。                                                          |
| ComfyUI 工作流 JSON                          | 服务端 `data/images/workflows/<workflowId>.json`，不放进设置值或每次生成请求。                                                    | `POST /api/gptImage/comfyui/import` 专用导入接口。                                                               |
| 任务、状态、输入快照                         | 服务端 `TaskService`，文件 `data/tasks.json`；任务不是前端可写的通用存储资源。                                                    | `GET /api/task/page`、`summary` 和 `DELETE /api/task/:id`；`tasks/useTasks.ts` 订阅变更后刷新当前页与摘要。      |
| 输入图、生成图                               | 服务端 `data/images/input/`、`data/images/generated/`。                                                                           | 上传接口返回 `/api/static/images/input/...`；任务输出为 `/api/static/images/generated/...`。                     |
| 图库待使用图片列表                           | 通用存储资源 `image.pending`，服务端文件 `data/images/pending.json`。                                                             | `src/client/features/image-assets/pendingImages.ts`。                                                            |
| 尺寸开关、画质、删除任务时保留图片等界面偏好 | 浏览器 `localStorage` 的 `gpt-image-settings`。                                                                                   | `src/client/hooks/useLocalSetting.tsx`。这些值不是服务端接入点配置。                                             |
| 最近使用的输入图                             | 浏览器 `localStorage` 的 `recent_uploaded_images`。                                                                               | `src/client/features/image-assets/useRecentImages.ts`。                                                          |

模板与任务各有一份输入数据：生成时前端提交本次生成所需的模板输入，服务端把它写入任务的 `inputSnapshot`。之后修改或删除模板，不会改动历史任务的输入。模板可以保存多张参考图；选中 ComfyUI 时，**生成和试生成必须恰好使用一张**，前后端都会检查。

## 生成流程

1. `TemplateForm` 负责试生成，`TemplateItemHeader` 负责按已保存模板生成，`tasks/TaskItem.tsx` 负责重试；三者通过 `generation/useImageGeneration.ts` 调用 `generation/service.ts`，统一使用 `POST /api/gptImage/generate`，以 `mode: generate | trial` 区分。请求类型从 Hono RPC 推导；旧 `/trial` URL 作为适配器保留原有默认值。
2. 服务端路由 `src/server/api/gpt-image/index.ts` 校验输入并返回 HTTP 响应，`src/server/module/gpt-image/service.ts` 统一构造快照、处理比例拼接并按接入点类型分发。地址、模型和密钥从同一份设置快照解析；云端接入点走同目录 `index.ts`，ComfyUI 走 `comfyui.ts`。不要只凭 Base URL 或模型 ID 猜测协议。
3. 云端分支使用 API Key、模型、尺寸、画质等参数。ComfyUI 分支只把提示词和一张参考图送入工作流，不使用模板比例、尺寸、画质、张数或“比例拼接”文案。
4. ComfyUI 提交接口创建任务后尽快返回 `taskId`，后台上传参考图、提交 `/prompt`、按 `prompt_id` 轮询 `/history`，再从标记的最终输出节点下载图片。云端生成也在任务登记后返回 `taskId`，后台执行；执行失败经任务状态展示，不再占用整轮 HTTP 请求。
5. 任务由 `TaskService` 流转 `pending → running → completed/failed`，并发布 `image.tasks` 事件。`useTasks` 收到事件后重新请求当前页，独立摘要覆盖所有历史任务；`TaskList` 展示运行、失败和输出图片，下载与删除使用服务端保存的图片，不依赖 ComfyUI 保留原文件。

云端参考图校验在创建任务之前完成；创建后整个执行流程共用失败收尾。提交成功只返回 `success` 和 `taskId`，不再附带永远为空的 `outputUrls`。业务提交服务只校验、登记并返回任务 ID，路由将明确的参数/配置错误映射为 400、缺失接入点或工作流映射为 404，存储与意外异常继续由全局 `onError` 映射。前端经通用 `rpcResult`/`rpcData` 保留 HTTP 状态与字符串或结构化错误。设置弹窗保存后继续生成时，前端重新读取接入点类型。

任务列表只展示来源为 `gpt-image-2` 或 `comfyui` 的任务。ComfyUI 任务不展示未实际使用的比例、尺寸和画质标签。重试使用任务的输入快照；ComfyUI 重试还使用任务记录的接入点 ID，并读取该接入点当前引用的最新版工作流。原接入点或工作流已删除时应明确报错，不能改用当前云端接入点。

`tasks/index.tsx` 管理任务过滤、分页、图片预览组和下载记录，`tasks/TaskItem.tsx` 展示单个任务的图片或错误、信息与操作。任务类型由服务端 `common/task/types.ts` 拥有，显式声明生成 `mode`、`finishedAt`、可选的 ComfyUI 元数据与 GPT token 用量；旧任务迁移和存储读改写继续保留已有字段。

模板表单类型从共享的 `TemplateValue` 派生，参考图仍由独立上传状态管理。新建、编辑和另存统一经 `templates/form/values.ts` 的 `toTemplateValue` 提取业务字段（包含张数 `n`）；编辑与另存保留未显示的比例、张数，清空张数时按未指定处理。

图片上传和生成图转参考图的请求封装在 `features/image-assets/service.ts`，跨模块经 `index.ts` 使用；普通上传、裁剪绘制和风格提取共用错误处理。`drop-targets.ts` 只注册一组全页拖放监听：明确拖入上传区时选该区，弹窗打开时只选当前可见弹窗中的上传区，页面只有一个可见上传区时允许拖入空白处。存在多个候选区或当前弹窗没有上传区时不自动上传；仍阻止浏览器打开拖入文件。选择图库时正在上传的图片也计入数量上限。

新任务显式保存 `mode`，试生成不再写入占位标题。旧任务缺失 `mode` 时仅在生图查询服务按 `Trial Template` 标题兼容；显式 `generate` 的同名模板按普通生成处理，前端不再用标题判断操作。云雾令牌创建位于 `module/yunwu/token.ts`，由已有 `api/yunwu-token.ts` 提供 `/api/gptImage/generate-api-key`，保留原 URL、请求和响应结构。

## 接入点与工作流

生图接入点设置在 `settings/Endpoint/`：`EndpointSetting.tsx` 管理表单展示，`useEndpointActions.ts` 管理保存、删除和工作流导入，`endpointPresets.tsx` 管理预设的前端说明和下拉值。`settings/store.ts` 的 `saveConfig` 一次提交完整设置并使用 revision 检测冲突；不要把一次接入点操作拆成多次设置写入。共享类型和预设定义位于 `src/shared/gpt-image/endpoints.ts`。

当前选择只持久化 `gptImageEndpointId`，预设 ID 与展示名称独立。地址、模型、密钥及协议由 `resolveImageEndpoint` 从同一接入点解析；自定义接入点明确选择 `openai` 或 `venice` 协议，执行不再按域名猜测。旧平铺字段、按名称保存的预设 ID/API Key 和未声明协议的自定义接入点在读取时规范化，下次成功保存写入新结构。失效的接入点不能静默换用其他接入点，设置弹窗可以重新选择。`getImageEndpointCapabilities` 集中定义尺寸、画质、参考图数量、输出张数、余额和远端取消能力；余额由独立的 `quotaProvider: none | new-api | venice` 字段决定，不从生成协议推出。预设显式声明提供商，自定义表单可选择余额接口；旧自定义配置仅按已知 Openlux、DragonAPI、云雾和 Venice 地址迁移，其他默认 `none`，可手动开启。`new-api` 使用 `/api/usage/token/`，`venice` 使用其原生余额接口。表单与提交校验共用。Venice 带参考图仅生成一张，无参考图最多四张；ComfyUI 不发送云端参数。

## 图片引用与执行收尾

`src/server/module/gpt-image/image-references.ts` 统一计算引用：输入图片由模板、所有任务的输入快照及待使用图片引用，生成图片由任务输出及尚未提交的执行文件引用。图库列表返回 `isReferenced`，前端不再自行判断能否删除；删除接口仍会重新检查。明确删除待使用项时先解除待使用引用，再清理没有模板或任务引用的文件。模板、待使用图片写入、任务提交和图片清理共用短期图片生命周期锁，锁内只做本地读写，不等待远端生成。

云端与 ComfyUI 共用 `GeneratedImageBatch`，每次执行拥有独立输出文件。任务成功状态落盘后确认保留，失败、取消或任务已删除时清理本次文件；未返回有效图片不能标记完成。任务删除原子取回删除瞬间的记录，清理时仍保护其他任务引用的旧共享文件，并清理缩略图。文件清理失败记录日志，后续图库清理可以再次处理；磁盘故障或进程崩溃不构成跨文件事务。

删除运行中的 ComfyUI 任务会先取消远端工作流；删除云端任务会中断本地等待并等待文件收尾，无法保证服务商停止执行或计费。保留图片选项保留已成功生成的输出，未完成的部分输出仍清理。

## 缓存同步

任务、模板和图库使用 `src/client/service/resource-cache.ts`：订阅者共用缓存和请求，刷新期间再次失效补拉一轮，过期响应不覆盖新数据，卸载后丢弃旧轮次响应；失败保留已有数据并暴露错误。模板写操作集中使缓存失效，组件不再通过 ref 手动刷新列表。SSE 初次连接及重连会补拉资源，覆盖断线期间遗漏的事件。图库还订阅模板、任务、待使用图片的引用变更和 `image.assets` 文件变更。

余额请求绑定明确接入点 ID，按 ID、协议、余额提供商、地址、模型和密钥区分缓存。切换时中断旧查询并以请求轮次保护结果，不再延迟 500ms 猜测配置保存时机。生图设置按 revision 应用服务端快照，旧读取不能覆盖更新后的配置，并订阅 `settings.gpt-image` 同步外部修改。

`GET /api/task/page?page=1&pageSize=10` 返回来源为云端生图或 ComfyUI 的任务详情和总数，页大小最多 100，删除末页后自动回到有效页。前端最多缓存五个最近页，SSE 只刷新已订阅页面及 `GET /api/task/summary` 的总数、运行数量和最新结束时间。完成通知依据全历史摘要，余额刷新依据最新云端完成时间，与当前页无关。批量下载在点击时读取 `/api/task/outputs` 的 ID、文件名和输出 URL；批量删除在点击时读取 `/api/task/ids?status=failed` 或全部 ID，继续逐任务执行原取消、引用检查及清理。下载失败不会标记整批已下载。旧 `GET /api/task` 全量接口保留供兼容，页面不再调用。

任务仓库按文件时间和大小缓存已排序的读取结果，内部写入后失效；读查询期间发生写入会补读，避免引用检查复用写入前的在途快照。写入仍经 `CollectionStore` 可靠落盘，未引入第二份任务持久化。服务端查询仍需要遍历本地历史，适合当前单文件本地应用；分页主要控制响应大小和前端渲染规模。

图库文件索引在 `common/static/file-index.ts`，为可重建的进程内缓存。首次扫描原有文件，应用内上传/输出写入和删除即时更新；目录时间变化时增量核对新增与移除，每次查询距上次完整核对超过 30 秒时重新 stat 以识别外部覆盖。扫描按每批 32 个文件进行，且不占图片生命周期锁；进入锁后取当前索引并查询引用。图库保留全量轻量目录元数据用于文件夹、最近使用和待使用视图，删除仍在锁内重新计算最新引用，不信任缓存的 `isReferenced`。索引不写盘，不改变图片文件和可靠业务存储的归属。

## ComfyUI 工作流

ComfyUI 只允许本机 HTTP 回环地址，规则统一在 `src/shared/gpt-image/comfyui.ts`。导入必须使用 **ComfyUI API 格式 JSON**，并有三个必需的 `_meta.title` 标记；标题匹配忽略大小写和首尾空格：

| 节点标题       | 用途                                                       |
| -------------- | ---------------------------------------------------------- |
| `LinAI@prompt` | `inputs.prompt` 每次替换为用户提示词。                     |
| `LinAI@image1` | `inputs.image` 每次替换为上传到 ComfyUI 的参考图文件名。   |
| `LinAI@output` | 从该节点的 `history.outputs[节点ID].images` 读取最终图片。 |
| `LinAI@seed`   | 可选；每次提交前将 `inputs.seed` 替换为随机整数。          |

导入与节点校验在 `src/server/module/gpt-image/comfyui-workflow.ts`；节点 ID 从导入文件扫描，不能写死。任务执行在同目录 `comfyui.ts`，每个任务复制工作流后再替换输入，不能修改磁盘模板或共用对象。最终输出要保存到 LinAI 的生成图目录。工作流更详细的约定见 `docs/comfyui/本地工作流接入生图实现方案.md`。

## 修改时从哪里入手

| 需求                         | 主要入口                                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 改模板字段、文件夹或列表操作 | `src/shared/image/template.ts`、`src/client/service/image-templates.ts`、`templates/`；核对任务快照和旧模板兼容性。                                                                                 |
| 改参考图上传、图库或图片编辑 | `src/client/features/image-assets/ImageUpload.tsx` 及同一公共图片模块的 `gallery/`、`crop/`、`draw/`；核对服务端静态图片目录与上传接口。                                                            |
| 增加或修改接入点配置         | `src/shared/gpt-image/endpoints.ts`、`src/server/module/gpt-image/settings.ts`、`settings/store.ts`、`settings/Endpoint/`；后端消费的字段走 SettingsRegistry。                                      |
| 改云端生图参数               | `src/server/api/gpt-image/index.ts`、`src/server/module/gpt-image/service.ts`、`generate.ts`、`generation/service.ts`、`generation/useImageGeneration.ts`、`generation/ImageGenerateDropdown.tsx`。 |
| 改 ComfyUI 工作流约定或执行  | `src/server/module/gpt-image/comfyui-workflow.ts`、`comfyui.ts`、`src/shared/gpt-image/comfyui.ts`；保留单图校验、任务隔离和输出清理。                                                              |
| 改任务展示或重试             | `tasks/`、`tasks/useTasks.ts`、`generation/useImageGeneration.ts`、`generation/service.ts`、`src/server/common/task/`；继续复用 `TaskService` 和 `image.tasks` 事件。                               |
| 改余额或侧栏接入点展示       | `settings/useGPTImageQuota.ts`、`src/client/pages/common/Sidebar/EndpointDisplay.tsx`；ComfyUI 不应触发云端余额请求。                                                                               |

开发遵循仓库根目录 `AGENTS.md`：依赖用 pnpm，不运行 build 或 eslint；代码完成后用 `npx tsc --noEmit` 做类型检查。除非另有要求，不使用视觉能力验证。
