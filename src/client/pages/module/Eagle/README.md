# Eagle 图片管理模块

只读浏览 Eagle 资源库（`.library` 目录）中的图片 / gif / 视频：左侧文件夹目录树，右侧网格资源列表，支持排序、刷新、大图预览与视频播放。对库目录有两个写操作：文件夹名称/描述编辑（`PUT /folders/:id`，写回库根 metadata.json）与图片整理确认的条目更新（`updateItem`，改条目 metadata.json 的 name/folders 并同步 mtime.json 与索引）。其余所有自身数据（配置、索引缓存、缩略图回退缓存、图片整理任务）落在 `data/eagle/` 下。

> 需求与方案文档：`docs/Eagle图片管理模块.txt`、`docs/Eagle图片管理模块-实现方案.md`、`docs/Eagle资源库.txt`（库结构说明）、`docs/Eagle/Eagle数据编辑和图片整理功能.txt`。修改本模块后请同步更新本文档。

## 文件结构

```
src/shared/eagle/types.ts                # 前后端共享类型（EagleFolder / EagleItem / 排序类型）

src/server/module/eagle/
├── settings.ts                          # 注册式设置：eagle（libraryPath，落盘 data/eagle/config.json）与 eagle-vision（视觉接入点，落盘 data/eagle/vision.json，与图片生成的 vision 配置互相独立），含 getEagleVisionEndpoint() 生效接入点
├── relay.ts                             # 注册 relay 目标 eagle.vision（POST /chat/completions，非流式），供整理执行器服务端直接调用
├── library.ts                           # 核心：内存索引（扫描/增量校验/fs.watch/查询）+ updateFolder 文件夹编辑 + updateItem 条目更新（改名/移动文件夹，同步 mtime.json 与索引后发布 eagle.library 变更）+ 图片整理查询（分类标准 getFolderStandards / 可处理图片 getClassifiableItems）
└── organize/                            # 图片整理（阶段三完成：任务基建 + 用户指定并发的队列执行 + 结果确认写库）
    ├── constants.ts                     # 模块自有常量：变更资源 ID、视觉上传压缩参数（与 common/static 的同名常量分开定义）
    ├── storage.ts                       # 私有持久化：任务 DocumentStore（task.json，含队列 itemIds 与进度计数）+ 结果 EntityStore（items/<itemId>.json，执行完成时才落盘），落盘 data/eagle/organize/，不注册通用存储；mutateTask 提供任务文档的串行读改写（service 与 executor 共用单例）
    ├── service.ts                       # OrganizeService 单例：prepare/创建/暂停/恢复/清空/队列预览/结果读取 + 确认（confirmItem 写库）/不处理（skipItem）/重新执行（retryItem，phase 拉回 running）+ 启动恢复（running→paused/restart），变更发布到 change bus 的 eagle.organize；创建/恢复/重新执行时 kick 执行器
    ├── executor.ts                      # 队列执行器：任务指定并发（1~10，默认 5）按序派发，支持中断 in-flight 请求的强制清空；跳过已完成项，支持「重新执行」在中途挖洞；累计 3 次单图失败后暂停派发（落盘异常仍立即暂停），全部执行完 → confirming/done；每张图完成发布变更
    └── vision.ts                        # 单图视觉判定：sharp 内存压缩（不落盘）→ 组装分类标准 prompt → requestRegistry.execute('eagle.vision') → 严格 JSON 解析（zod）+ 0～3 个 folderPaths 匹配校验，支持 AbortSignal，失败抛错由执行器记为 failed

src/server/api/eagle.ts                  # Hono 子路由，挂在 /api/eagle

src/client/pages/module/Eagle/           # 本目录
├── index.tsx                            # 页面入口：左右分栏布局 + 未配置引导页（移动端隐藏左侧目录树），挂载时拉取 eagle 与 eagle-vision 配置
├── api.ts                               # /api/eagle/* fetch 封装 + 文件 URL 辅助
├── store.ts                             # zustand：文件夹树/列表/排序/分页/图片大小档位/展示选项（文件名/文件大小）
├── FolderTree.tsx                       # 左侧 antd Tree（展开状态持久化 localStorage，节点带文件夹图标与图片数）；右键菜单「编辑」改名称/描述
├── ResourceGrid.tsx                     # 右侧网格 + 分页 + 图片预览 + 视频 Modal，可按需在格子底部叠加文件名/文件大小
├── Organize/                            # 「图片整理」弹窗（三步流程，依赖视觉接入点配置）
│   ├── index.tsx                        # Modal 壳：按任务阶段路由步骤（running/paused→执行中，confirming→结果确认，done/无任务→分类划定）
│   ├── StepClassify.tsx                 # 步骤 1：分类标准列表（有描述的文件夹，顺序即优先级）+ 处理数量 + 并发数（1~10，默认 5）+ 压缩选项，确定后创建任务
│   ├── StepRunning.tsx                  # 步骤 2：执行状态/进度（已执行/总数、成功/失败）/暂停继续/清空；暂停时可批量重试全部错误或直接用成功图片进入分类；滚动队列表展示前 20 条执行中、待处理或失败条目（缩略图/状态/信息），完成无误的项过滤，完成后弹窗壳自动切步骤 3
│   ├── StepConfirm.tsx                  # 步骤 3：结果确认——顶部待确认缩略图条（点击选中）+ 左大图右信息面板（状态/当前标题/可勾选的建议标题/原文件夹/至多 3 个候选目标文件夹，默认首项/低质/失败原因）+ 底部不处理(红)/重新执行/确认，操作后本地移除并自动选中下一张；无候选表示不属于任何已知分类
│   ├── api.ts                           # /api/eagle/organize/* 封装
│   └── store.ts                         # zustand：轻量 status + SSE 订阅（eagle.organize），Toolbar 徽标与弹窗共用；并发刷新只接纳最新请求，避免旧响应覆盖新阶段
├── Toolbar.tsx                          # 「展示选项」下拉面板（排序/图片大小/文件名/文件大小）+ 刷新 + 「图片整理」按钮（Badge：队列剩余数/待确认红点）+ 移动端「切换文件夹」抽屉
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
- 变更资源：`eagle.organize`（整理任务/结果，service 注册）、`eagle.library`（library.ts 注册，`updateItem` 写库后发布，前端订阅刷新列表）

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

## 索引机制（library.ts）

性能设计的核心，不要退化成"逐个读 2 万个 metadata.json"：

1. **启动**：读 `data/eagle/index.json` 缓存进内存（实测 1.7 万条目约 100ms）；无缓存才全量扫描（并发池 32）
2. **增量校验**（启动后、手动刷新、watch 触发时）：读库根 `mtime.json` + `readdir images/` → 与内存索引对比 → 只重读新增/lastModified 变化/删除的条目 → 回写缓存
3. **fs.watch**（images/ 与库根目录）只作触发器（500ms 去抖），Windows 大目录下可能丢事件，判断一律落到 mtime 对比；`mtime.json` 缺失时降级为"新目录读 metadata，已有条目信任缓存"
4. 排序、文件夹计数、过滤全部在内存索引上完成；`isDeleted` 条目在建索引时剔除

## API（/api/eagle）

| 方法 | 路径                                                                 | 说明                                                                                                                                                    |
| ---- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET  | `/folders`                                                           | 文件夹树，`count` 直接包含数 / `totalCount` 含子孙累计                                                                                                  |
| PUT  | `/folders/:id`                                                       | 编辑文件夹名称/描述（body `{ name, description }`），写回库根 metadata.json（另一个写操作是整理确认的 `updateItem`）                                    |
| GET  | `/items?folderId&sortBy&sortOrder&offset&limit`                      | 服务端排序分页；`sortBy=mtime\|size`，`limit` 上限 500；缺省 folderId = 全部                                                                            |
| POST | `/refresh`                                                           | 触发增量校验（库路径变化时重建索引）                                                                                                                    |
| GET  | `/items/:id/thumbnail`                                               | 优先库内 `_thumbnail.png` → 缺失时图片用 sharp 生成 200px webp 缓存到 `data/eagle/thumb/` → 视频回退占位 SVG                                            |
| GET  | `/items/:id/file`                                                    | 原文件流式返回，支持 Range（206），视频可拖进度条                                                                                                       |
| GET  | `/organize/prepare?folderId&sortBy&sortOrder`                        | 图片整理步骤 1 数据：分类标准列表（有描述的文件夹，先序遍历=优先级从上到下）+ 当前范围内可处理图片数（排除 gif/视频）                                   |
| GET  | `/organize/status`                                                   | 图片整理轻量状态（phase/remaining/pendingConfirm/pausedReason），无任务返回 null，供按钮徽标轮询                                                        |
| GET  | `/organize/task`                                                     | 图片整理任务详情（分类标准快照 + 进度计数，不含队列明细）                                                                                               |
| POST | `/organize/task`                                                     | 创建整理任务 `{ folderId?, sortBy, sortOrder, count, compress, concurrency? }`；并发范围 1~10，默认 5；已有未完成任务 409；创建前清空旧结果            |
| POST | `/organize/task/pause` `/organize/task/resume`                       | 用户暂停（停止派发，in-flight 不受影响）/ 恢复执行，状态不符 409                                                                                        |
| POST | `/organize/task/retry-failed`                                        | 暂停时把全部失败结果重置为待处理、移到队首并恢复执行                                                                                                     |
| POST | `/organize/task/classify-successful`                                 | 暂停且已有成功结果时，过滤未处理与失败条目，仅用成功图片进入结果确认                                                                                       |
| POST | `/organize/task/clear`                                               | 强制停止所有请求、丢弃当前任务与结果；弹窗回到步骤 1                                                                                                      |
| GET  | `/organize/queue?limit=20`                                          | 执行中队列预览：仅返回执行中、待处理与失败条目；成功项过滤，失败项含错误信息，limit 上限 50                                                              |
| GET  | `/organize/results?status=&offset=&limit=`                           | 整理结果列表（按状态过滤，可选 offset/limit 分页缺省全量，按 updatedAt 倒序，摘要不含正文）                                                             |
| GET  | `/organize/results/:itemId`                                          | 单图结果详情（附条目当前名称 `itemName`，`status` 取值见 `src/shared/eagle/organize.ts`）                                                               |
| POST | `/organize/results/:itemId/confirm`                                  | 确认结果 `{ folderPath, withTitle }`：校验所选路径属于该图候选项，经 `updateItem` 移入目标文件夹（可选改标题）后状态 → confirmed；无候选时不可确认；目标文件夹已从库中删除时 409 |
| POST | `/organize/results/:itemId/skip` / `/organize/results/:itemId/retry` | 不处理（状态 → skipped）/ 重新执行单图（状态 → pending、phase → running，仅该图入队）                                                                   |

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
7. 目录树展开/收起状态持久化在 localStorage `eagle_folder_expanded`（无记录时默认全展开）；移动端（`usePlatform().isMobile`）不渲染左侧栏，由工具栏「切换文件夹」按钮开抽屉展示同一棵 `FolderTree`
8. 目录树右键节点 →「编辑」弹窗改文件夹名称/描述，保存后仅重拉文件夹树（`refreshFolders`）；「图片整理」按钮先校验 `eagle-vision` 的生效密钥，未配置时以 initialOnly 模式弹设置引导，保存后继续打开整理弹窗
9. 图片整理（阶段三完成）：`Organize/store.ts` 订阅 SSE（`/api/storage/events?resources=eagle.organize`）驱动徽标与弹窗阶段路由，并以请求序号丢弃晚到的旧状态响应，避免完成后被旧 `running` 状态卡回步骤 2；步骤 2 的进度数字统一取同一次 task 快照，避免混用独立接口响应显示出矛盾计数。队列未完成显示剩余数（点击进步骤 2 不能新建）、有待确认显示小红点（点击只显示结果确认）。任务持久化在 `data/eagle/organize/`（task.json + items/），服务重启时 running 任务自动转为 paused（原因 restart），重启前 in-flight 未落盘的项恢复后重新执行。步骤 1 可指定队列并发数（1~10，默认 5）；服务端执行器按该值推进队列，视觉判定经 `eagle.vision` 中继，压缩在内存中完成不落盘。步骤 2 的滚动列表预览前 20 条执行中、待处理和失败项目（缩略图 / 状态 / 信息）；成功项目进入结果确认步骤不再显示，失败项目显示错误信息。清空操作会取消 in-flight 请求、丢弃任务与结果，并回到步骤 1。任务累计出现 3 个单图失败结果后暂停派发，暂停时可把全部失败项重置后移到队首继续执行；已有成功结果时也可过滤未处理与失败项，直接进入结果确认。视觉响应为按推荐程度排列的 0～3 个候选文件夹，空数组表示不属于任何已知分类。结果确认步骤默认选择首个候选，用户可切换后确认；确认/不处理后待确认计数减一（全部处理完 phase → done），确认请求携带所选候选路径并经 `updateItem` 写库（移动文件夹、可选改标题并重命名原文件），写库后发布 `eagle.library` 变更，Eagle 页面订阅该资源（`index.tsx`）刷新文件夹树与当前页；重新执行把单图状态置回 pending、phase 拉回 running（弹窗切回步骤 2）

## 图片整理维护约束

- **单任务与状态**：同一时间只保留一个任务；`running` / `paused` 时不能新建，`confirming` 表示仍有 `success` / `failed` 结果待处理，全部确认或跳过后进入 `done`。单图 `pending` 只用于重新执行，最终结果为 `confirmed` 或 `skipped`。
- **持久化与计数**：任务文档保存分类标准快照和 `itemIds`，单图结果在执行完成后才懒创建，避免建任务时批量生成大量小文件；任务文档允许最大 16M。任务读改写必须走 `mutateTask` 串行化；执行器收尾按结果实体重算 `executed` / `pendingConfirm` / 成败计数，不能只信任中途累计值。
- **分类响应**：视觉响应严格为 `{ title, folderPaths, lowQuality }`；`folderPaths` 必须是分类标准中的 0～3 个不重复路径，按推荐程度排序，空数组是合法成功结果。HTTP/网络、非 JSON、结构非法、候选越界或存储写盘异常会记为失败；任务累计出现 3 个失败结果后暂停继续派发。未压缩原图超过 relay 请求体上限也会记为失败。
- **重新执行**：retry 先把结果置为 `pending`，并回补 `executed` / `pendingConfirm`；`attempts` 只在执行器真正再次处理时增加。执行器必须跳过已有非 pending 结果，避免重新执行一张图片时重复处理其后的已完成项。
- **确认写库**：提交的 `folderPath` 必须属于该图候选项且对应文件夹当前仍存在；`folders` 是替换而非追加语义。可选标题会清理 Windows 非法字符、压缩空白并截断至 120 字符；重名时追加 ` (1)`～` (99)`，原文件与缩略图随之重命名。仅当库中原本存在 `mtime.json` 时才同步该指纹文件。
- **展示边界**：`failed` 或无候选结果不可确认，只能重新执行或不处理；`lowQuality` 只在确认页提示，不触发自动跳过或删除。
- **待验证**：Eagle 应用运行与关闭两种状态下，经 `updateItem` 外部写入后，Eagle 自身能否稳定感知改动，仍需实际环境验证。

## 样式约定

- 网格格子：`aspect-square` + `object-cover` + `loading="lazy"`，参考 `GalleryImageGrid`
- 页面高度：主容器无固定高度，页面根用 `h-[calc(100dvh-1.5rem)] sm:h-[calc(100dvh-3rem)]`（扣除 main 垂直内边距），左右栏内部滚动
- 暗色：沿用 `dark:` 前缀类（`html[data-theme='dark']` 映射）

## 修改指南

- **加列表字段**：改 `src/shared/eagle/types.ts` 的 `EagleItem` + `library.ts` 的 `toEagleItem`；若需持久化到索引缓存，同步改 `EagleItemIndex` 和 `buildIndexEntry`（旧缓存缺字段时要有默认值兜底，或考虑清缓存逻辑）
- **加排序维度**：扩展 `EagleSortBy` + `getItems` 排序逻辑 + `Toolbar` 选项（注意 localStorage 里旧值要能正常解析）
- **加 API**：`api/eagle.ts` 内新增，保持信封结构和 id 校验；前端在 `api.ts` 加封装
- **写库操作**仅限 `library.ts` 的 `updateFolder` / `updateItem`（都要同步内存索引并原子写回，`updateItem` 还需同步 mtime.json 与原文件重命名）；不要在其他地方直接写库目录；不要复用 `common/static` 的 `serveImage`（整读 Buffer 不支持 Range）
- 改完跑 `npx tsc --noEmit`，然后更新本文档
