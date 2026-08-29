# Eagle 图片管理模块

只读浏览 Eagle 资源库（`.library` 目录）中的图片 / gif / 视频：左侧文件夹目录树，右侧网格资源列表，支持排序、刷新、大图预览与视频播放。对库目录有两个写操作：文件夹名称/描述编辑（`PUT /folders/:id`，写回库根 metadata.json）与图片整理确认的条目更新（`updateItem`，改条目 metadata.json 的 name/folders 并同步 mtime.json 与索引）。其余所有自身数据（配置、索引缓存、缩略图回退缓存、图片整理任务）落在 `data/eagle/` 下。

> 需求与方案文档：`docs/Eagle图片管理模块.txt`、`docs/Eagle图片管理模块-实现方案.md`、`docs/Eagle资源库.txt`（库结构说明）、`docs/Eagle/Eagle数据编辑和图片整理功能.txt`。修改本模块后请同步更新本文档。

## 文件结构

```
src/shared/eagle/types.ts                # 前后端共享类型（EagleFolder / EagleItem / 排序类型）

src/server/module/eagle/
├── settings.ts                          # 注册式设置：eagle（libraryPath，落盘 data/eagle/config.json）与 eagle-vision（视觉接入点，落盘 data/eagle/vision.json，与图片生成的 vision 配置互相独立），含 getEagleVisionEndpoint() 生效接入点
├── relay.ts                             # 注册 relay 目标 eagle.vision（POST /chat/completions，非流式），供整理执行器服务端直接调用
├── library/                             # 核心：Eagle 资源库索引与操作（模块化拆分，由 index.ts 统一聚合导出）
│   ├── types.ts                         # 数据模型（原始/索引结构）、路径常量、变更资源 ID（eagle.library）与基础工具函数
│   ├── index-state.ts                   # 内存索引生命周期（ensureIndex/refreshIndex）、增量扫描（mtime 对比与并发池）、本地缓存持久化、fs.watch 监听与文件路径解析
│   ├── query.ts                         # 只读查询与数据投影：文件夹树/计数统计（getFolderTree）、服务端排序分页（getItems）、整理标准提取（getFolderStandards）与路径解析
│   ├── operations.ts                    # 持久化写操作：updateFolder 文件夹编辑 + updateItem 条目更新（改名/同名序号/移动文件夹）+ deleteItem/restoreItem 回收站软删除/还原 + purgeItem/purgeTrash 物理删除
│   └── index.ts                         # 统一聚合导出入口
└── organize/                            # 图片整理（阶段三完成：任务基建 + 用户指定并发的队列执行 + 结果确认写库）
    ├── constants.ts                     # 模块自有常量：变更资源 ID、视觉上传压缩参数（与 common/static 的同名常量分开定义）
    ├── storage.ts                       # 私有持久化：任务 DocumentStore（task.json，含队列 itemIds 与进度计数）+ 结果 EntityStore（items/<itemId>.json，执行完成时才落盘）+ 内存 itemsCache 索引缓存（高频 query 毫秒级响应），落盘 data/eagle/organize/，不注册通用存储；mutateTask 提供任务文档的串行读改写（service 与 executor 共用单例）
    ├── service/                         # OrganizeService 模块化服务（拆分为 types / helpers / task / queue / result / index）
    │   ├── types.ts                     # 参数与操作返回类型定义
    │   ├── helpers.ts                   # 视图转换与变更发布辅助函数
    │   ├── task.ts                      # 任务生命周期（创建/准备/追加/暂停/恢复/清空/启动自愈）
    │   ├── queue.ts                     # 队列预览与失败项集中重试/跳过
    │   ├── result.ts                    # 结果列表/详情/确认写库/清除分类/单图重试
    │   └── index.ts                     # OrganizeService 单例门面与统一导出
    ├── executor.ts                      # 队列执行器：任务指定并发（1~10，默认 5）按序派发，全局相邻请求至少间隔 0.5 秒，支持中断 in-flight 请求的强制清空；跳过已完成项，支持「重新执行」在中途挖洞；累计 10 次单图失败后暂停派发（落盘异常仍立即暂停），全部执行完 → confirming/done；每张图完成发布变更
    └── vision.ts                        # 单图视觉判定：sharp 内存压缩（不落盘）→ 组装分类标准 prompt → requestRegistry.execute('eagle.vision') → 严格 JSON 解析（zod）+ 0～3 个 folderPaths 匹配校验，标题自动追加 _【模型第一个词】【模型数字】 后缀，支持 AbortSignal，失败抛错由执行器记为 failed

src/server/api/eagle.ts                  # Hono 子路由，挂在 /api/eagle

src/client/pages/module/Eagle/           # 本目录
├── index.tsx                            # 页面入口：左右分栏布局 + 未配置引导页（移动端隐藏左侧目录树），挂载时拉取 eagle 与 eagle-vision 配置
├── api.ts                               # /api/eagle/* fetch 封装 + 文件 URL 辅助
├── store.ts                             # zustand：文件夹树/列表/排序/分页/图片大小档位/展示选项（文件名/文件大小）
├── FolderTree/                          # 左侧 antd Tree（展开状态持久化到后端设置，节点带文件夹图标与图片数）；「全部」下含「未分类」与「回收站」虚拟节点，真实文件夹支持右键/长按编辑名称/描述
├── ResourceGrid.tsx                     # 右侧网格 + 分页 + 图片预览 + 视频 Modal，可按需在格子底部叠加文件名/文件大小，卡片支持右键/长按弹出菜单（修改文件夹/移到回收站/彻底删除）
├── components/                          # 模块公共组件与弹窗
│   ├── FolderSelectModal.tsx            # 树形选择文件夹弹窗
│   └── confirmDeleteModal.ts            # 移到 Eagle 回收站统一二次确认函数
├── Organize/                            # 「图片整理」弹窗（左侧导航卡片 + 三步骤非互斥协同，依赖视觉接入点配置）
│   ├── index.tsx                        # Modal 壳：标题栏展示锁定文件夹，左侧 StepNavBar 导航卡片 + 右侧步骤组件，支持智能默认与非互斥自由切换
│   ├── StepNavBar.tsx                   # 导航卡片栏：01待添加（蓝）/02处理中（紫）/03待确认（绿）三个卡片按钮，具区分度背景色，移动端横排置顶，展示实时状态、执行进度与待查验/失败徽标
│   ├── StepClassify.tsx                 # 步骤 1：新建任务（分类标准优先级列表 + 数量/并发/压缩）/ 追加模式（展示当前锁定文件夹剩余未入队数并随时追加到队尾）
│   ├── StepRunning/                     # 步骤 2：执行中任务（拆分为主入口 index / CompletedCards / QueueList / FailedList / BottomBar）
│   │   ├── index.tsx                    # 主入口：状态与批量操作、Tab 切换与完成双卡片组装
│   │   ├── CompletedCards.tsx           # 完成且无错误时居中展示左右并置操作卡片（继续添加 / 开始确认）
│   │   ├── QueueList.tsx                # 排队与执行中列表
│   │   ├── FailedList.tsx               # 失败待处理列表与单项重试/跳过
│   │   └── BottomBar.tsx                # 底部操作栏（清空任务、暂停/继续、去确认结果）
│   ├── StepConfirm/                     # 步骤 3：纯净结果确认（拆分为主入口 index / useManualFolders / ThumbnailBar / ConfirmControls / QuickConfirmList / DetailPanel / ActionBar）
│   │   ├── index.tsx                    # 主入口：纯净结果确认——仅查验判定成功项，支持普通模式（顶部缩略图条 + 左大图右信息面板 + 底部快捷操作）与快速模式（居中放大列表 + 卡片底部直接确定），预加载后续 3 张大图与详情（普通模式），重新执行不打断确认流
│   │   ├── useManualFolders.ts          # 手动选择文件夹历史记录 Hook
│   │   ├── ThumbnailBar.tsx             # 顶部缩略图滚动列表（右侧集成 ConfirmControls）
│   │   ├── ConfirmControls.tsx          # 排序方式切换与快速模式开关控件
│   │   ├── QuickConfirmList.tsx         # 快速模式下居中放大的图片卡片横向滚动列表（带每项首选分类确定按钮）
│   │   ├── DetailPanel.tsx              # 右侧条目信息与分类选择面板
│   │   └── ActionBar.tsx                # 底部快捷操作栏
│   └── store.ts                         # zustand：轻量 status + SSE 订阅（eagle.organize，最快 1 秒节流 + in-flight 单飞合并），Toolbar 徽标与弹窗共用
├── Toolbar.tsx                          # 「展示选项」下拉面板（排序/图片大小/文件名/文件大小）+ 刷新 + 「全部彻底删除」（回收站视图可用）+ 「图片整理」按钮（Badge：队列剩余数/待确认红点）+ 移动端「切换文件夹」抽屉
└── SettingModal/
    ├── index.tsx                        # 设置弹窗（openEagleSettingModal）：资源库 / 视觉接入点两个标签页
    ├── useEagleConfig.ts                # 资源库配置 zustand store（/api/settings/eagle）
    ├── useEagleVisionConfig.ts          # 视觉接入点 zustand store（/api/settings/eagle-vision，独立 keychain）
    └── VisionEndpointSetting.tsx        # 视觉接入点薄封装，绑定公共组件 common/components/VisionEndpoint
```

注册点：

- 路由/侧栏：`src/client/routes.tsx` 中 `path: '/eagle'` 一项（侧栏自动出现，设置按钮挂 `onClickSetting`）
- 后端路由：`src/server/index.ts` 链式 `.route('/api/eagle', eagleApi)`
- 设置汇总：`src/server/common/settings/resources.ts` 副作用导入 `module/eagle/settings`
- 中继汇总：`src/server/common/relay/resources.ts` 副作用导入 `module/eagle/relay`（目标 eagle.vision，整理执行器服务端直连）
- 变更资源：`eagle.organize`（整理任务/结果，service 注册）、`eagle.library`（`module/eagle/library/types.ts` 注册，`operations.ts` 写库后发布，前端订阅刷新列表）

## Eagle 库结构（只读依赖）

```
<库>.library/
├── metadata.json            # 文件夹树（folders 嵌套 children）
├── mtime.json               # { 图片ID: lastModified }，全库变更指纹（Eagle 私有实现）
└── images/<id>.info/
    ├── <name>.<ext>         # 原文件
    ├── <name>_thumbnail.png # Eagle 预生成缩略图（可能不存在）
    └── metadata.json        # { id, name, ext, size, width, height, mtime, folders[], lastModified, isDeleted }
```

注意：图片归属哪个文件夹记录在**图片的** metadata.json 的 `folders[]` 里，文件夹自身不含成员列表。

## 索引机制（library/index-state.ts）

性能设计的核心，不要退化成"逐个读 2 万个 metadata.json"：

1. **启动**：读 `data/eagle/index.json` 缓存进内存（实测 1.7 万条目约 100ms）；无缓存才全量扫描（并发池 32）
2. **增量校验**（启动后、手动刷新、watch 触发时）：读库根 `mtime.json` + `readdir images/` → 与内存索引对比 → 只重读新增/lastModified 变化/删除的条目 → 回写缓存
3. **fs.watch**（images/ 与库根目录）只作触发器（500ms 去抖），Windows 大目录下可能丢事件，判断一律落到 mtime 对比；`mtime.json` 缺失时降级为"新目录读 metadata，已有条目信任缓存"
4. 排序、文件夹计数、过滤全部在内存索引上完成；`isDeleted` 条目保留在索引中，常规查询与文件夹计数中自动排除，供回收站视图检索、恢复或彻底删除

## API（/api/eagle）

| 方法   | 路径                                                                 | 说明                                                                                                                                             |
| ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/folders`                                                           | 文件夹树，`count` 直接包含数 / `totalCount` 含子孙累计                                                                                           |
| PUT    | `/folders/:id`                                                       | 编辑文件夹名称/描述（body `{ name, description }`），写回库根 metadata.json                                                                      |
| GET    | `/items?folderId&sortBy&sortOrder&offset&limit`                      | 服务端排序分页；`sortBy=mtime\|size`，`limit` 上限 500；缺省 folderId = 全部，`folderId=__unclassified__` = 未分类，`folderId=__trash__` = 回收站 |
| PUT    | `/items/:id`                                                         | 编辑条目（修改所属文件夹 / 标题），写回条目 metadata.json 与 mtime.json 并同步索引                                                               |
| DELETE | `/items/:id`                                                         | 移入 Eagle 回收站（软删除，设置 `isDeleted: true` 并同步 mtime.json 与索引，保留磁盘原文件）                                                     |
| DELETE | `/items/:id/purge`                                                   | 彻底删除单张图片（物理删除磁盘 `images/<id>.info` 目录与缩略图缓存，同步 mtime.json 与索引）                                                     |
| POST   | `/trash/purge`                                                       | 全部彻底删除回收站条目（物理删除所有 `isDeleted: true` 条目磁盘文件并清空回收站）                                                                |
| POST   | `/items/:id/restore`                                                 | 从 Eagle 回收站恢复条目（设置 `isDeleted: false` 并同步 mtime.json 与索引）                                                                      |
| POST   | `/refresh`                                                           | 触发增量校验（库路径变化时重建索引）                                                                                                             |
| GET    | `/items/:id/thumbnail`                                               | 优先库内 `_thumbnail.png` → 缺失时图片用 sharp 生成 200px webp 缓存到 `data/eagle/thumb/` → 视频回退占位 SVG                                     |
| GET    | `/items/:id/file`                                                    | 原文件流式返回，支持 Range（206），视频可拖进度条                                                                                                |
| GET    | `/organize/prepare?folderId&sortBy&sortOrder`                        | 图片整理步骤 1 数据：分类标准列表 + 当前范围内可处理图片数/已入队数/剩余可追加数（已排除 gif/视频/heif/heic）                                     |
| GET    | `/organize/status`                                                   | 图片整理轻量状态（phase/remaining/pendingConfirm/failedCount/folderId/folderName/isLocked），供按钮徽标与导航卡片轮询                            |
| GET    | `/organize/task`                                                     | 图片整理任务详情（分类标准快照 + 进度计数 + 锁定文件夹信息，不含队列明细）                                                                       |
| POST   | `/organize/task`                                                     | 创建整理任务 `{ folderId?, sortBy, sortOrder, count, compress, concurrency? }`；锁定选定文件夹；并发 1~10 默认 5；已有未完成任务 409；清空旧结果 |
| POST   | `/organize/task/append`                                              | 向当前锁定任务追加未入队的图片到队尾 `{ count }`；无缝扩充队列                                                                                   |
| POST   | `/organize/task/pause` `/organize/task/resume`                       | 用户暂停（停止派发，in-flight 不受影响）/ 恢复执行，状态不符 409                                                                                 |
| POST   | `/organize/task/retry-failed`                                        | 批量重试失败项：重置为待处理并重新加入执行队列继续执行                                                                                           |
| POST   | `/organize/task/skip-failed`                                         | 批量跳过所有失败项                                                                                                                               |
| POST   | `/organize/task/classify-successful`                                 | 暂停且已有成功结果时，过滤未处理与失败条目，仅用成功图片进入结果确认                                                                             |
| POST   | `/organize/task/clear`                                               | 强制停止所有请求、丢弃当前任务与结果，解锁文件夹；弹窗回到新建状态                                                                               |
| GET    | `/organize/queue?limit=20`                                           | 执行中队列预览：仅返回执行中与待处理条目；limit 上限 50                                                                                          |
| GET    | `/organize/failed-items`                                             | 步骤 2 失败列表：返回所有判定失败的图片及具体错误原因                                                                                            |
| GET    | `/organize/results?status=&offset=&limit=`                           | 整理结果列表（按状态过滤，步骤 3 仅请求 status=success，按 updatedAt 倒序）                                                                      |
| POST   | `/organize/results/confirm-batch`                                    | 批量确认结果 `{ items: [{ itemId, folderPath, folderId?, withTitle }] }`：批量移入目标文件夹并写库                                               |
| GET    | `/organize/results/:itemId`                                          | 单图结果详情（附条目当前名称 `itemName`，`status` 取值见 `src/shared/eagle/organize.ts`）                                                        |
| POST   | `/organize/results/:itemId/confirm`                                  | 确认结果 `{ folderPath, folderId?, withTitle }`：支持 AI 候选项或手动选择的文件夹，经 `updateItem` 移入目标文件夹后状态 → confirmed              |
| POST   | `/organize/results/:itemId/skip` / `/organize/results/:itemId/retry` | 不处理（状态 → skipped）/ 重新执行单图（状态 → pending 送回步骤 2 队列，不打断步骤 3）                                                           |
| POST   | `/organize/results/:itemId/clear-classification`                     | 清除分类后手动处理：把条目的 `folders` 替换为空数组并将结果状态置为 skipped，条目随后出现在「未分类」虚拟文件夹                                  |

约定：

- 条目 id 校验 `^[A-Za-z0-9]+$`，文件路径一律从索引查出，不拼接用户输入
- 文件/缩略图响应以 `lastModified` 为 ETag（`must-revalidate`），库内容变更后浏览器缓存自动失效
- 信封结构 `{ success, data }` 与其他模块一致；前端经 `apiRequest`（`client/service/storage.ts`）解析

## 前端数据流

1. `index.tsx` 挂载 → `fetchEagleConfig()` → 有 `libraryPath` 才 `store.init()`，否则显示「去配置」引导
2. `store.init()` 并行拉 `/folders` + 第一页 `/items`（每页 100）
3. 切换文件夹 / 排序 / 翻页 → 重拉对应页；排序偏好、图片大小档位、展示选项（文件名/文件大小）分别持久化在 localStorage `eagle_sort` / `eagle_image_size` / `eagle_display_options`
4. `ResourceGrid` 底部 antd `Pagination` 翻页（移动端 simple 模式），翻页后网格滚动回顶部
5. 预览：图片进 `Image.PreviewGroup`（items 只含非视频）；视频点击开 Modal 内 `<video>`（依赖 file 接口的 Range 支持）
6. 设置弹窗保存库路径后调用 `store.reload()`（= POST /refresh + 重拉数据）；视觉接入点标签页挂载时拉取 `eagle-vision` 配置
7. 目录树展开/收起状态持久化在后端设置 `eagle-folder-tree`（首次读取会迁移 localStorage `eagle_folder_expanded`，无记录时默认全展开）；「全部」下方的「未分类」与「回收站」虚拟节点分别筛选 `folders` 为空的条目与已删除条目并显示实时数量；移动端（`usePlatform().isMobile`）不渲染左侧栏，由工具栏「切换文件夹」按钮开抽屉展示同一棵 `FolderTree`
8. 目录树右键/长按节点 →「编辑」弹窗改文件夹名称/描述，保存后仅重拉文件夹树（`refreshFolders`）；「图片整理」按钮先校验 `eagle-vision` 的生效密钥，未配置时以 initialOnly 模式弹设置引导，保存后继续打开整理弹窗
9. 图片整理流程：
   - 弹窗采用 `StepNavBar` 导航卡片（桌面端左侧竖排，移动端上方横排，三个步骤分别采用蓝/紫/绿区分色彩）+ 主操作区架构，标题栏明确显示当前锁定的文件夹。
   - 只要任务存在未完成图片即处于锁定状态，禁止切换其他文件夹分类；若要切换必须清空任务或全部完成。
   - **步骤 1（待添加）**：未锁定时为新建任务模式；锁定状态下为追加模式，展示当前文件夹剩余未入队图片数，可随时将图片追加到队列末尾。
   - **步骤 2（处理中）**：展示执行状态与进度（`已执行/总数`）；集中管理失败任务（支持单项重试、单项跳过、重试所有错误、全部跳过），失败项不计入成功计数，不流入步骤 3；提供队列预览与查验跳转。
   - **步骤 3（待确认）**：纯净查验判定成功的结果（`status === 'success'`）；顶部支持切换排序（完成顺序/图片分类/修改时间）与「快速模式」开关；
     - **普通模式**：顶部缩略图条 + 左大图（原图展示并自动预加载后续 3 张大图与右侧详情）+ 右侧分类面板 + 底部快捷操作（移到回收站/A清除分类/S不处理/重新执行/D确认）；
     - **快速模式**：隐藏大图与右侧详情以跳过耗时请求，展示居中放大的图片列表，每张图片卡片底部带有「确定」按钮，直接按首选推荐分类归档（支持按键 D 快捷确认当前项，并保持 20 项或 3 秒防抖批量落盘机制）；
     - 单图重新执行将该图重置为 pending 送回步骤 2 队列，步骤 3 自动聚焦下一张，不打断确认流。
   - 全部图片确认/跳过后，任务状态转为 done，文件夹锁定自动解除。

## 图片整理维护约束

- **锁定文件夹约束**：任务运行期间（未进入 `done` 且未清空）文件夹处于锁定状态，保证追加与分类范围严格受控。
- **持久化与计数**：任务文档保存分类标准快照、`folderId`、`folderName` 和 `itemIds`。`pendingConfirm` 仅统计判定成功待确认的项；`failedCount` 统计失败项并在步骤 2 集中处理。任务读改写必须走 `mutateTask` 串行化。
- **分类响应**：视觉响应严格为 `{ title, folderPaths, lowQuality }`；`folderPaths` 必须是分类标准中的 0～3 个不重复路径，按推荐程度排序，空数组是合法成功结果；标题生成后自动追加 `_【模型第一个词】【模型数字】`（如 `_gemini3.7`、`_gpt5.6`）标识起标题的模型。
- **确认写库**：提交的 `folderPath` 必须属于该图候选项且对应文件夹当前仍存在；可选标题清理非法字符并截断至 120 字符；重名时追加 ` (1)`～` (99)`，原文件与缩略图随之重命名。
- **重新执行**：单图 retry 重置为 `pending` 并回退相应计数，执行器继续派发，步骤 3 不跳出。

## 样式约定

- 网格格子：`aspect-square` + `object-cover` + `loading="lazy"`，参考 `GalleryImageGrid`
- 页面高度：主容器无固定高度，页面根用 `h-[calc(100dvh-1.5rem)] sm:h-[calc(100dvh-3rem)]`（扣除 main 垂直内边距），左右栏内部滚动
- 暗色：沿用 `dark:` 前缀类（`html[data-theme='dark']` 映射）

## 修改指南

- **加列表字段**：改 `src/shared/eagle/types.ts` 的 `EagleItem` + `src/server/module/eagle/library/query.ts` 的 `toEagleItem`；若需持久化到索引缓存，同步改 `src/server/module/eagle/library/types.ts` 的 `EagleItemIndex` 和 `index-state.ts` 的 `buildIndexEntry`（旧缓存缺字段时要有默认值兜底，或考虑清缓存逻辑）
- **加排序维度**：扩展 `EagleSortBy` + `library/query.ts` 中 `getItems` 排序逻辑 + `Toolbar` 选项（注意 localStorage 里旧值要能正常解析）
- **加 API**：`api/eagle.ts` 内新增，保持信封结构和 id 校验；前端在 `api.ts` 加封装
- **写库操作**仅限 `library/operations.ts` 的 `updateFolder` / `updateItem` 等（都要同步内存索引并原子写回，`updateItem` 还需同步 mtime.json 与原文件重命名）；不要在其他地方直接写库目录；不要复用 `common/static` 的 `serveImage`（整读 Buffer 不支持 Range）
- 改完跑 `npx tsc --noEmit`，然后更新本文档
