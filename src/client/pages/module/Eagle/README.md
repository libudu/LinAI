# Eagle 图片管理模块

浏览 Eagle 资源库（`.library` 目录）中的图片 / gif / 视频：左侧文件夹目录树，右侧网格资源列表，支持排序、刷新、大图预览与视频播放。显式写库操作包括文件夹编辑、条目名称/归属编辑、整理确认以及回收站软删除、还原和彻底删除；库内元数据写入成功后同步内存索引，修改指纹与可重建分片缓存采用 5 秒防抖。其余所有自身数据（配置、索引缓存、缩略图回退缓存、图片整理任务）落在 `data/eagle/` 下。修改本模块后请同步更新本文档。

## 文件结构

```
src/shared/eagle/
├── types.ts                             # 文件夹、条目、排序与虚拟文件夹常量
└── organize.ts                          # 整理响应与结果契约、分类提示词

src/server/module/eagle/
├── settings.ts                          # 注册式设置：资源库路径与独立视觉接入点；设置类型统一从 zod schema 推导，前端仅 import type；含 getEagleVisionEndpoint() 生效接入点
├── storage.ts                           # 通用存储：eagle.folder-tree / eagle.manual-folders 单条目集合，沿用旧文件位置并迁移原设置文档信封，业务 value 类型由前端拥有
├── change-journal.ts                    # 库/整理各自使用的有界变更记录（最近 512 次，带启动期游标），过期或整体失效时返回完整快照
├── schemas.ts                           # Eagle 请求参数校验的唯一定义；服务参数从 schema 输出推导，前端输入从 RPC 推导
├── errors.ts                            # 结构化业务错误（如 TASK_CHANGED），由全局 onError 转为统一信封
├── relay.ts                             # 注册 relay 目标 eagle.vision（POST /chat/completions，非流式），供整理执行器服务端直接调用
├── concurrency.ts                       # 模块共享并发池，扫描/缓存/整理持久化复用，等待已启动工作结束再传播失败
├── media/                               # 媒体处理服务，不依赖 HTTP 上下文
│   ├── index.ts                         # 原文件描述、缩略图读取/串行生成、导入输入图库；媒体路径取自同一索引快照
│   └── cache.ts                         # 回退缩略图大小与缓存路径，生成和删除共用
├── library/                             # 核心：Eagle 资源库索引与操作（模块化拆分，由 index.ts 统一聚合导出）
│   ├── types.ts                         # 原始/索引数据模型与操作参数，仅类型，无运行时副作用
│   ├── runtime.ts                       # 内部路径/格式常量、库级写锁与 eagle.library 变更资源注册
│   ├── index-state.ts                   # 内部索引生命周期，协调缓存恢复、扫描、切库与手动刷新
│   ├── scan.ts                          # 元数据读取/索引条目构造与 mtime 增量扫描，默认并发 32
│   ├── shard-cache.ts                   # 可重建的 32 个 Hash 分片：恢复、脏分片局部写入、5 秒防抖，失败保留脏标记
│   ├── mtime-state.ts                   # 库根修改指纹：已加载读取与磁盘重载分开，保留本应用待写 ID，保存时合并磁盘其他 ID
│   ├── folders.ts                       # 基于传入目录树的纯逻辑：展示树、节点查找、完整路径与后序分类标准，查询和写操作共用
│   ├── query.ts                         # 只读查询与数据投影：目录概览、文件夹树、版本失效的排序分页视图（最多 8 份 LRU）、整理标准与路径解析；getItemDetail 的业务详情和归属路径来自同一索引，getItemMediaSource 一次解析媒体路径与扩展名
│   ├── operations.ts                    # 写操作聚合门面
│   ├── folder-operations.ts             # 文件夹编辑：原子写回库根元数据并发布变更
│   ├── item-operations.ts               # 条目编辑：改名计划/失败回滚、元数据写入、带 ID 与原因的逐项结果
│   ├── trash-operations.ts              # 回收站：软删除/还原共用实现，物理删除失败不移除索引
│   ├── mutation.ts                      # 写锁与统一收尾：同步已成功项的指纹/分片缓存/变更事件，批次失败也执行
│   └── index.ts                         # 显式业务门面：只读查询、手动刷新、写操作与必要参数类型，不导出可变索引/扫描/脏标记
└── organize/                            # 图片整理（阶段三完成：任务基建 + 用户指定并发的队列执行 + 结果确认写库）
    ├── constants.ts                     # 模块自有常量：变更资源 ID、视觉上传压缩参数、执行器连续失败暂停阈值与全局派发最小间隔（与 common/static 的同名常量分开定义）
    ├── model.ts                         # 服务端任务模型与持久化旧数据类型，统一补全旧任务字段、将旧 folderPath 归一为 folderPaths
    ├── storage.ts                       # 读写边界归一化后的私有持久化：任务 DocumentStore（task.json，含队列 itemIds 与进度计数）+ 结果 EntityStore（items/<itemId>.json，saveItemsBatch 16 并发，全部结束后传播失败）+ 写盘成功后发布的内存缓存，落盘 data/eagle/organize/，不注册通用存储；mutateTask 提供任务文档的串行读改写，异常后下一次修改按实际结果校准（service 与 executor 共用单例）
    ├── transitions.ts                   # 任务阶段与计数的纯转换函数，生命周期/失败处理/单图决策/执行器共用，支持异常后与启动时校准
    ├── service/                         # OrganizeService 模块化服务（任务、队列、结果与确认计划）
    │   ├── types.ts                     # 参数与操作返回类型定义
    │   ├── helpers.ts                   # 视图转换与变更发布辅助函数
    │   ├── task.ts                      # 任务生命周期（创建/准备/追加/暂停/恢复/清空/启动自愈）
    │   ├── queue.ts                     # 队列预览与失败项集中重试/跳过
    │   ├── confirmation.ts              # 单张/批量共用确认计划：状态校验、目标文件夹解析、缺失条目自愈、已确认项幂等
    │   ├── result.ts                    # 分页结果与增量成功结果同步/详情/确认计划执行与逐项反馈/清除分类/单图重试
    │   └── index.ts                     # OrganizeService 单例门面；用户命令串行化，防止重复决策扣减
    ├── executor.ts                      # 队列执行器：任务指定并发（1~20，默认 20）按序派发，全局相邻请求至少间隔 0.5 秒，支持中断 in-flight 请求的强制清空；跳过已完成项，支持「重新执行」在中途挖洞；连续 10 次单图失败后暂停派发并发送 Windows 错误通知（任意一次成功后重头计数，落盘异常仍立即暂停并通知），全部执行完 → confirming/done 并发送 Windows 完成通知；每张图完成发布变更
    └── vision.ts                        # 单图视觉判定：sharp 内存压缩（不落盘）→ 组装分类标准 prompt → requestRegistry.execute('eagle.vision') → 严格 JSON 解析（zod）+ 0～3 个 folderPaths 匹配校验，标题自动追加 _【模型第一个词】【模型数字】 后缀，支持 AbortSignal，失败抛错由执行器记为 failed

src/server/api/eagle/                    # Hono 子路由，挂在 /api/eagle（拆分为 index.ts / library.ts / organize.ts）
├── index.ts                             # 聚合路由入口，分别挂载 / 与 /organize
├── library.ts                           # 资源库 HTTP 适配（概览/列表/编辑/软硬删除/媒体响应，保留 ETag、Range 与错误映射）
└── organize.ts                          # 图片整理接口（任务生命周期/队列控制/结果查验与写库）

src/client/pages/module/Eagle/           # 本目录
├── index.tsx                            # 页面入口：左右分栏布局 + 未配置引导页（移动端隐藏左侧目录树），挂载时拉取 eagle 与 eagle-vision 配置
├── api.ts                               # /api/eagle/* RPC 封装 + 文件 URL 辅助
├── rpc.ts                               # hc<AppType> 创建 Eagle 客户端，响应与请求类型随后端路由推导
├── store.ts                             # zustand：资源列表与展示状态，请求序号防止旧响应覆盖当前列表
├── settings/                            # 模块级配置状态，页面入口、工具栏与设置表单共用
│   ├── useEagleConfig.ts                 # 资源库配置 zustand store（/api/settings/eagle），保存失败抛给表单处理
│   └── useEagleVisionConfig.ts           # 视觉接入点 zustand store（/api/settings/eagle-vision，独立 keychain）
├── preferences.ts                       # 排序/大小/展示选项/选中文件夹的 localStorage 读写，保留原有键
├── preferenceTypes.ts                   # 前端拥有的目录展开、手动分类历史模型，不从服务端 settings 推导
├── preferenceDocument.ts                # 通用集合中的 preferences 单条目：共享加载/集合版本与本地订阅，加载中修改按实际数据重放，串行保存并合并等待中的最新状态，保存响应不覆盖后续操作
├── folders.ts                           # 前端文件夹纯逻辑：查找、key 收集、完整路径映射与分类顺序；拥有 SelectedFolderInfo 业务类型
├── libraryRefresh.ts                    # 刷新控制器：SSE 与主动刷新合并，整理弹窗期间记脏、关闭后补拉
├── refreshQueue.ts                      # 共享刷新队列：请求中再次失效时补拉，调用方等待所有补拉结束
├── hooks/useResourceActions.ts          # 网格条目编辑/删除/添加图库与文件夹选择弹窗状态
├── FolderTree/                          # 左侧 antd Tree（展开状态经通用存储持久化到便携数据目录，节点带文件夹图标与图片数）；「全部」下含「未分类」与「回收站」虚拟节点，真实文件夹支持右键/长按编辑名称/描述
│   └── useFolderExpansion.ts            # 展开偏好加载/保存与旧 localStorage 迁移，成功写入后移除旧记录；初始定位的临时展开状态不直接写盘
├── ResourceGrid.tsx                     # 右侧网格 + 分页 + 图片预览 + 视频 Modal，可按需在格子底部叠加文件名/文件大小，卡片支持右键/长按弹出菜单（修改文件夹/移到回收站/彻底删除）
├── components/                          # 模块公共组件与弹窗
│   ├── ResourceGridItem.tsx             # 单条目卡片与右键/长按菜单，只接收展示数据和操作回调
│   ├── FolderSelectModal.tsx            # 树形选择文件夹弹窗（打开自动居中定位至目标文件夹节点）
│   └── confirmDeleteModal.ts            # 移到 Eagle 回收站统一二次确认函数
├── Organize/                            # 「图片整理」弹窗（左侧导航卡片 + 三步骤非互斥协同，依赖视觉接入点配置）
│   ├── index.tsx                        # Modal 壳：左侧 StepNavBar 导航卡片 + 右侧步骤组件，支持智能默认与非互斥自由切换，追加后同步队列总数
│   ├── StepNavBar.tsx                   # 导航卡片栏：01待添加（蓝）/02处理中（紫）/03待确认（绿）三个卡片按钮，具区分度背景色，移动端横排置顶，展示实时状态、执行进度与待查验/失败徽标
│   ├── StepClassify.tsx                 # 步骤 1 UI：标准列表、数量/并发/压缩、来源选择与提示词预览
│   ├── hooks/useOrganizeTask.ts          # 弹窗任务快照：请求合并，关闭/切轮次时丢弃旧响应
│   ├── hooks/useClassifyTask.ts          # 准备数据/请求过期保护、选项持久化、新建/追加/标准同步，追加沿用服务端任务设置
│   ├── StepRunning/                     # 步骤 2：执行中任务（拆分为主入口 index / CompletedCards / QueueList / FailedList / BottomBar）
│   │   ├── index.tsx                    # 主入口：Tab、队列/失败列表与完成卡片组装
│   │   ├── hooks/useRunningTask.ts       # 队列/失败项查询、请求调度、轮次保护和用户命令
│   │   ├── CompletedCards.tsx           # 完成且无错误时居中展示左右并置操作卡片（继续添加 / 开始确认）
│   │   ├── QueueList.tsx                # 排队与执行中列表
│   │   ├── FailedList.tsx               # 失败待处理列表与单项重试/跳过
│   │   └── BottomBar.tsx                # 底部操作栏（清空任务、暂停/继续、去确认结果）
│   ├── StepConfirm/                     # 步骤 3：纯净结果确认（模块化分层：index 主装配 / types / components / hooks / utils）
│   │   ├── index.tsx                    # 主入口：纯净结果确认装配器——查验判定成功项，普通模式（顶部缩略图条 + 左大图右信息面板 + 底部快捷操作）与快速模式（居中放大列表 + 卡片底部直接确定），调度批次队列与预加载
│   │   ├── types.ts                     # 共享类型与常量（OrganizeSortType, PinnedFolderOption, SPECIAL_CATEGORY_*）
│   │   ├── components/                  # 纯 UI 与视口组件（ConfirmImageViewer 原图大图 / ThumbnailBar 缩略图条 / ConfirmControls / QuickConfirmList / DetailPanel / ActionBar）
│   │   ├── hooks/                       # useConfirmQueue 决策门面与删除后跳过命令 / useConfirmResults 增量列表、本地排序与移除恢复 / useConfirmSubmission 提交、逐项失败反馈与状态校准 / useConfirmSelection 默认推荐、每图选择/标题开关与置顶 / useOrganizePreload / useConfirmShortcuts / useManualFolders
│   │   └── utils/                       # list.ts 两种确认视图共用的平铺列表类型与构造 / sort.ts 分类顺序与多维排序 / storage.ts 本地存储 / submissionQueue.ts 批次防抖与单图操作的串行队列
│   ├── statusModel.ts                   # 纯计算：乐观记录转换、快照校准与展示计数派生
│   ├── statusRefresh.ts                 # 状态刷新控制器：订阅计数/SSE 节流/过期快照保护/提交后校准
│   └── store.ts                         # zustand 状态与公共操作门面，组合状态模型和刷新控制器
├── Toolbar.tsx                          # 「展示选项」下拉面板（排序/图片大小/文件名/文件大小）+ 刷新 + 「全部彻底删除」（回收站视图可用）+ 「图片整理」按钮（Badge：队列剩余数/待确认红点）+ 移动端「切换文件夹」抽屉
└── SettingModal/
    ├── index.tsx                        # 设置弹窗（openEagleSettingModal）：资源库 / 视觉接入点两个标签页
    └── VisionEndpointSetting.tsx        # 视觉接入点薄封装，绑定公共组件 common/components/VisionEndpoint
```

注册点：

- 路由/侧栏：`src/client/routes.tsx` 中 `path: '/eagle'` 一项（侧栏自动出现，设置按钮挂 `onClickSetting`）
- 后端路由：`src/server/index.ts` 链式 `.route('/api/eagle', eagleApi)`
- 存储汇总：`src/server/common/storage/resources.ts` 副作用导入 `module/eagle/storage`；`eagle.folder-tree`、`eagle.manual-folders` 经 `/api/storage/collections/:resource` 访问
- 设置汇总：`src/server/common/settings/resources.ts` 副作用导入 `module/eagle/settings`
- 中继汇总：`src/server/common/relay/resources.ts` 副作用导入 `module/eagle/relay`（目标 eagle.vision，整理执行器服务端直连）
- 变更资源：`eagle.organize`（整理任务/结果，service 注册）、`eagle.library`（`module/eagle/library/runtime.ts` 注册，`mutation.ts` / `folder-operations.ts` 写库后发布，前端订阅刷新列表）

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

## 索引机制（library/index-state.ts 协调 scan.ts / shard-cache.ts）

性能设计的核心，不要退化成"逐个读 2 万个 metadata.json"：

1. **启动**：读 `data/eagle/index-shards/` 32 分片缓存并发载入内存（实测 1.7 万条目约 100ms）；无缓存才全量扫描（并发池 32）
2. **增量校验**（启动后、手动刷新时）：重新读库根 `mtime.json`（保留本应用尚未落盘的 ID 改动）+ `readdir images/` → 与内存索引对比 → 只重读新增/lastModified 变化/删除的条目 → 仅标记脏分片回写；指纹文件/单项指纹缺失时重读相应元数据，避免刷新继续信任旧缓存
3. **分片持久化**（条目确认/编辑等写操作）：按 ID Hash 散列到 32 个分片，防抖落盘时仅并发重写变动的脏分片（每次仅数百 KB，消除 95% 以上的 I/O），彻底根治全库重写卡顿
4. **外部变更同步**：外部 Eagle 客户端若有新增/修改，由用户点击工具栏右上角「刷新」按钮（`POST /refresh`）手动增量校验；本应用自身的所有写操作（确认/改名/移动/软删除）元数据写盘成功后内存即时生效；目前没有 fs.watch 监听
5. 排序、文件夹计数、过滤全部在内存索引上完成；目录概览与最多 8 份按文件夹/排序/可分类条件区分的排序视图按库版本缓存，翻页仅切片并投影当页条目。条目写入、软删除/恢复、物理删除在更新内存索引后立即记录 ID 并失效视图；目录编辑、切库、手动扫描（含扫描失败后的部分修改）整体失效。稳定排序仍沿用索引条目顺序。`isDeleted` 条目保留在索引中，常规查询与文件夹计数中自动排除，供回收站视图检索、恢复或彻底删除

## API（/api/eagle）

| 方法   | 路径                                                                 | 说明                                                                                                                                                                                                       |
| ------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/overview`                                                          | 目录树与全部、未分类、回收站计数；一次遍历统计，不排序条目                                                                                                                                                 |
| GET    | `/folders`                                                           | 文件夹树，`count` 直接包含数 / `totalCount` 含子孙累计                                                                                                                                                     |
| PUT    | `/folders/:id`                                                       | 编辑文件夹名称/描述（body `{ name, description }`），写回库根 metadata.json                                                                                                                                |
| GET    | `/items?folderId&sortBy&sortOrder&offset&limit`                      | 服务端排序分页；`sortBy=mtime\|size`，`limit` 上限 500；缺省 folderId = 全部，`folderId=__unclassified__` = 未分类，`folderId=__trash__` = 回收站                                                          |
| PUT    | `/items/:id`                                                         | 编辑条目（修改所属文件夹 / 标题），写回条目 metadata.json 与 mtime.json 并同步索引                                                                                                                         |
| DELETE | `/items/:id`                                                         | 移入 Eagle 回收站（软删除，设置 `isDeleted: true` 并同步 mtime.json 与索引，保留磁盘原文件）                                                                                                               |
| DELETE | `/items/:id/purge`                                                   | 彻底删除单张图片（物理删除磁盘 `images/<id>.info` 目录与缩略图缓存，同步 mtime.json 与索引）                                                                                                               |
| POST   | `/trash/purge`                                                       | 全部彻底删除回收站条目（物理删除所有 `isDeleted: true` 条目磁盘文件并清空回收站）                                                                                                                          |
| POST   | `/items/:id/restore`                                                 | 从 Eagle 回收站恢复条目（设置 `isDeleted: false` 并同步 mtime.json 与索引）                                                                                                                                |
| POST   | `/refresh`                                                           | 触发增量校验（手动强制刷新，库路径变化时重建索引）                                                                                                                                                         |
| GET    | `/items/:id/thumbnail`                                               | 优先库内 `_thumbnail.png` → 缺失时图片用 sharp 生成 200px webp 缓存到 `data/eagle/thumb/` → 视频回退占位 SVG                                                                                               |
| POST   | `/items/:id/add-to-gallery`                                          | 图片导入输入图库，压缩和去重沿用公共图库规则                                                                                                                                                               |
| GET    | `/items/:id/file`                                                    | 原文件流式返回，支持 Range（206），视频可拖进度条                                                                                                                                                          |
| GET    | `/organize/prepare?folderId&sortBy&sortOrder`                        | 图片整理步骤 1 数据：分类标准列表 + 当前范围内可处理图片数/已入队数/剩余可追加数（已排除 gif/视频/heif/heic）                                                                                              |
| GET    | `/organize/status`                                                   | 图片整理轻量状态（taskId/createdAt/phase/total/remaining/pendingConfirm/failedCount），taskId 区分任务轮次，供按钮徽标与导航卡片订阅                                                                       |
| GET    | `/organize/task`                                                     | 图片整理任务详情（分类标准快照 + 进度计数，不含队列明细）                                                                                                                                                  |
| POST   | `/organize/task`                                                     | 创建整理任务 `{ expectedTaskId, folderId?, sortBy, sortOrder, count, compress, concurrency? }`；并发 1~20 默认 20；已有未完成任务 409；清空旧结果                                                          |
| POST   | `/organize/task/append`                                              | 从指定范围追加图片到队尾 `{ taskId, folderId?, sortBy?, sortOrder?, count }`；省略 folderId 为全部，排序默认 mtime/desc；在任务串行更新内按 ID 去重，沿用任务的标准/并发/压缩；暂停任务追加后仍暂停        |
| POST   | `/organize/task/pause` `/organize/task/resume`                       | 用户暂停（停止派发，in-flight 不受影响）/ 恢复执行，状态不符 409                                                                                                                                           |
| POST   | `/organize/task/sync-standards`                                      | 非运行状态（暂停或已运行完待确认等）下同步最新分类标准快照：外部库标准与当前快照不一致时更新 task.standards，执行中或已结束 409                                                                            |
| POST   | `/organize/task/retry-failed`                                        | 批量重试失败项：重置为待处理并重新加入执行队列继续执行                                                                                                                                                     |
| POST   | `/organize/task/skip-failed`                                         | 批量跳过所有失败项                                                                                                                                                                                         |
| POST   | `/organize/task/classify-successful`                                 | 暂停且已有成功结果时，过滤未处理与失败条目，仅用成功图片进入结果确认                                                                                                                                       |
| POST   | `/organize/task/clear`                                               | 强制停止所有请求、丢弃当前任务与结果；弹窗回到新建状态                                                                                                                                                     |
| GET    | `/organize/queue?limit=20`                                           | 执行中队列预览：返回执行中、待处理和失败条目；limit 上限 50                                                                                                                                                |
| GET    | `/organize/failed-items`                                             | 步骤 2 失败列表：返回所有判定失败的图片及具体错误原因                                                                                                                                                      |
| GET    | `/organize/results?status=&offset=&limit=`                           | 纯查询整理结果列表（按状态过滤，支持 offset/limit，分页后才查询素材摘要，按 updatedAt 倒序）；不校准结果、不写任务计数                                                                                     |
| GET    | `/organize/results/changes?resultsVersion=&libraryVersion=`          | 纯查询成功结果同步：首次/游标过期返回 `reset: true` 完整列表；有效游标只返回变化的 `items` 与移出成功集合的 `removedIds`，并返回两份新版本；不修改任务或结果                                               |
| POST   | `/organize/results/reconcile`                                        | 显式校准缺失结果 `{ taskId }`，确认页进入时调用；有效索引中的缺失成功项标为 confirmed，索引不可用返回 409                                                                                                  |
| POST   | `/organize/results/confirm-batch`                                    | 请求 `{ items: [{ itemId, folderPath, folderId?, withTitle }], taskId }`；返回逐项结果 `{ items: [{ itemId, ok, outcome? 或 status/error }] }`，过期任务整体返回 409，无效目标等逐项失败，已确认项重放成功 |
| GET    | `/organize/results/:itemId`                                          | 单图结果详情（附条目当前名称 `itemName`，`status` 取值见 `src/shared/eagle/organize.ts`）                                                                                                                  |
| POST   | `/organize/results/:itemId/confirm`                                  | 确认结果 `{ taskId, folderPath, folderId?, withTitle }`：与批量共用确认计划与 `updateItems`，支持 AI 候选或手动目标，写库后 → confirmed；单图接口保留 HTTP 错误反馈                                        |
| POST   | `/organize/results/:itemId/trash`                                    | 确认页移至回收站并跳过 `{ taskId }`；命令锁内先校验任务身份，写库成功或条目缺失后才跳过，返回 `{ missing }`                                                                                                |
| POST   | `/organize/results/:itemId/skip` / `/organize/results/:itemId/retry` | 不处理（状态 → skipped）/ 重新执行单图（状态 → pending 送回步骤 2 队列，不打断步骤 3）                                                                                                                     |
| POST   | `/organize/results/:itemId/clear-classification`                     | 清除分类后手动处理：把条目的 `folders` 替换为空数组并将结果状态置为 skipped，条目随后出现在「未分类」虚拟文件夹                                                                                            |

约定：

- 条目 id 校验 `^[A-Za-z0-9]+$`，文件路径一律从索引查出，不拼接用户输入
- 文件/缩略图响应以 `lastModified` 为 ETag，使用 `private, max-age=86400`；浏览器缓存一天，过期后再条件验证
- 成功信封 `{ success: true, data }`；错误信封 `{ success: false, error: { code, message } }`。校验错误统一返回 400 / `VALIDATION_FAILED`，JSON 格式错误返回 400 / `INVALID_REQUEST`，任务身份不符返回 409 / `TASK_CHANGED`；存储错误保留原错误码。
- 路由必须链式注册，保留到 `AppType` 的输入/输出类型。前端经 `rpc.ts` 的 Hono 客户端和 `client/service/http.ts` 的 `rpcData` 调用；动态设置/存储资源仍使用 `apiRequest`。`StorageApiError` 作为 `ApiError` 的兼容导出，已有存储调用方无需调整。
- 所有现有任务修改命令（追加、暂停/恢复、清空、批量与单图操作、缺失结果校准）必须在 JSON body 中携带 `taskId`，服务端在用户命令锁内先校验身份，再执行变更。新建请求必须携带准备数据的 `expectedTaskId`（无任务时为 null），防止过期准备页覆盖新任务。
- 查询参数使用 zod 校验，非法排序/状态/分页参数返回 400；分页默认值与有效范围保持原约定。

## 前端数据流

1. `index.tsx` 挂载 → `fetchEagleConfig()` → 有 `libraryPath` 才 `store.init()`，否则显示「去配置」引导
2. `store.init()` 先拉 `/overview`（目录树及三个虚拟节点计数），校验上次选择的文件夹，再拉第一页 `/items`（每页 100）；刷新目录无需额外查询三份列表来统计总数
3. 切换文件夹 / 排序 / 翻页 → 重拉对应页；排序偏好、图片大小档位、展示选项（文件名/文件大小）分别持久化在 localStorage `eagle_sort` / `eagle_image_size` / `eagle_display_options`
4. `ResourceGrid` 底部 antd `Pagination` 翻页（移动端 simple 模式），翻页后网格滚动回顶部；条目写操作（修改文件夹/移到回收站/彻底删除）后通过 `requestEagleLibraryRefresh` 合并 SSE 与主动刷新，静默拉取更新，保持网格容器稳定不卸载，滚动条位置维持且前台图片无闪烁；右键「修改文件夹」自动优先选择当前图片所属文件夹，由 `FolderSelectModal` 自动居中滚动到该节点；点击确定后立即关闭模态框并在后台异步执行修改与静默刷新，彻底避免关闭延迟与选中态过期闪烁
5. 预览：图片进 `Image.PreviewGroup`（items 只含非视频）；视频点击开 Modal 内 `<video>`（依赖 file 接口的 Range 支持）
6. 设置弹窗保存库路径后调用 `store.reload()`（= POST /refresh + 重拉数据）；视觉接入点标签页挂载时拉取 `eagle-vision` 配置
7. 目录树展开/收起状态由前端拥有，经通用集合 `eagle.folder-tree` 的固定 `preferences` 条目持久化到 `data/eagle/folder-tree.json`（首次读取会迁移 localStorage `eagle_folder_expanded`，无记录时默认全展开）；「全部」下方的「未分类」与「回收站」虚拟节点分别筛选 `folders` 为空的条目与已删除条目并显示实时数量；移动端（`usePlatform().isMobile`）不渲染左侧栏，由工具栏「切换文件夹」按钮开抽屉展示同一棵 `FolderTree`
   - 手动分类目标历史及计数同样由前端拥有，使用 `eagle.manual-folders` 集合的 `preferences` 条目，落盘 `data/eagle/manual-folders.json`。两份文件均沿用原位置：读取时兼容旧 SettingsRegistry 文档信封（也接受扁平对象），下次保存原子写为集合信封；保留备份恢复、集合 revision 冲突检测与加载中操作重放。目录展开的旧 localStorage 记录仍在成功保存后才删除。库路径与视觉模型继续走 `eagle` / `eagle-vision` 设置；本次不增加跨库隔离。

8. 目录树右键/长按节点 →「编辑」弹窗改文件夹名称/描述，保存后经统一刷新入口重拉目录树与当前页（与服务端 SSE 合并）；「图片整理」按钮先校验 `eagle-vision` 的生效密钥，未配置时以 initialOnly 模式弹设置引导，保存后继续打开整理弹窗
9. 图片整理流程：
   - 弹窗采用 `StepNavBar` 导航卡片（桌面端左侧竖排，移动端上方横排，三个步骤分别采用蓝/紫/绿区分色彩）+ 主操作区架构。
   - 任务不锁定来源文件夹：可关闭弹窗从目录树切换，也可在步骤 1 内点击「切换文件夹」选择全部、未分类或任意真实文件夹，继续添加到同一任务。
   - **步骤 1（待添加）**：无未完成任务时为新建模式；已有未完成任务时为追加模式，展示当前选择范围的名称、已入队数和剩余可追加数，按当前页面排序追加，沿用任务的分类标准快照、并发数与压缩设置；暂停状态追加后仍需手动继续。当任务非运行状态（如暂停或已运行完待确认等）且外部文件夹顺序或分类标准发生变化时，左下角支持「同步最新文件夹」，将最新标准快照原子同步至当前任务。
   - **步骤 2（处理中）**：队列预览按任务顺序直接读取内存状态 Map，不再投影/排序全部结果；失败列表复用按状态的摘要视图，展示行才读取详情。展示执行状态与进度（`已执行/总数`）；集中管理失败任务（支持单项重试、单项跳过、重试所有错误、全部跳过），失败项不计入成功计数，不流入步骤 3；提供队列预览与查验跳转。
   - **步骤 3（待确认）**：纯净查验判定成功的结果（`status === 'success'`）；首次经 `/results/changes` 获取完整成功列表，后续状态刷新和库 SSE 共用刷新队列，只合并变化条目/移除 ID；没有列表变化时跳过前端重排。切换排序只重算本地视图。两份游标只在响应被接受后推进，过期响应不覆盖当前轮次或乐观操作；顶部支持切换排序（完成顺序/图片分类/修改时间）与「快速模式」开关；
     - **分类排序与特殊分类置顶**：分类排序下，按当前任务固化的分类顺序稳定排序（避免确认中途数量减少后重新打开窗口导致分类排位跳动）；特殊分类置顶展示：`疑似低质`（所有 `lowQuality` 为 true 的图片，无视推荐分类，作为首位特殊分类置顶展示，不影响实际归档文件夹，缩略图与卡片带有琥珀色警告图标与标签）第一，`未分类`（`folderPaths` 为空数组且非低质）第二，常规分类按任务固化顺序第三；
     - **普通模式**：顶部缩略图条 + 左大图（原图展示并在左上角显示原图尺寸与大小徽标，自动预加载当前项及后续共 5 张大图与右侧详情）+ 右侧分类面板（整行空白可点击选中；hover 展示 pin 置顶按钮，自定义选项置于删除按钮右侧，支持单选项强制置顶且新图默认选中，便于同类图片快速确认）+ 底部快捷操作（移到回收站/A清除分类/S不处理/重新执行/D确认）；
     - **快速模式**：隐藏普通模式的大图面板与右侧详情，展示居中放大的图片列表（卡片直接懒加载原图，点击放大也使用原图，左上角显示原图尺寸与大小徽标）；保留卡片点击选中与高亮，A/S/D 快捷键操作当前选中项，也可逐图使用底部「确定(D) / 清除分类(A) / 不处理(S)」按钮操作；确定直接按首选推荐分类归档，保持 20 项或 3 秒防抖批量落盘机制；确认后的选中项切换或列表更新不触发自动滚动定位；
     - 单图重新执行将该图重置为 pending 送回步骤 2 队列，步骤 3 自动聚焦下一张，不打断确认流。
   - 全部图片执行完，且待确认与失败项都处理完后，任务状态转为 done，可创建新一轮任务；仅剩失败项时仍可在步骤 2 重试/跳过。

## 图片整理维护约束

- **查询缓存与增量同步**：单图结果只在成功落盘后更新摘要/状态 Map、失效受影响状态的列表视图并记录变更 ID。库和整理各保留最近 512 次变更，游标包含服务启动期 UUID，不依赖毫秒时间戳，因此同毫秒批量确认/重试不会漏项。新建/清空、清空失败后重载、扫描/目录整体变化、服务重启或超过历史范围会要求完整重置；客户端重置时替换本地 Map，否则按 ID 合并/移除。结果查询仍为纯 GET，缺失成功项的状态校准只走进入确认页时显式发出的 POST 命令。素材索引变化只更新结果投影，不隐式把缺失素材标为已确认。

- **跨文件夹追加**：来源范围只决定本次挑选的图片，不限制后续追加；单轮任务仍共用分类标准快照、并发与压缩设置。已有旧任务无需迁移即可从其他文件夹追加。
- **领域模型与旧数据**：`model.ts` 定义服务端任务模型，服务和状态转换不从存储实现导入类型。`storage.ts` 在读取和写入边界调用统一归一化函数：旧任务缺失的来源名称、计数与并发补默认值；缺少 taskId 时使用稳定的 `legacy-${createdAt}`，新任务使用 UUID；旧结果 `folderPath` 转为 `folderPaths`，已有空数组优先。兼容字段不再进入当前共享接口，读取不主动改写旧文件。
- **持久化与计数**：任务文档保存分类标准快照和 `itemIds`，保留 `folderId`、`folderName` 作为首批来源的历史信息。阶段与计数统一经 `transitions.ts` 转换：`pendingConfirm` 仅统计成功待确认项；`failedCount` 为当前失败待处理数；`successCount` 保留已确认/跳过的成功项，重新执行时撤回上一轮成功；`total` 随追加更新。任务读改写走 `mutateTask` 串行化，结果状态保存与相应计数转换放在同一串行回调中，执行器收尾读取最新结果重算计数；启动恢复也按结果校准。只有队列执行完且待确认/失败都为 0 才进入 done；启动时修正旧版仅剩失败却已 done 的任务。任务文档与每个结果实体只在写盘成功后发布缓存，不预先展示未保存的新状态。单张/批量共用实体保存实现；批量部分成功时成功项仍生效，等全部条目结束后抛出首个错误，失败项保留旧缓存。删除成功后才发布空缓存，部分删除失败会使缓存失效，后续重读实际文件。该串行化不等于多文件写盘事务：实体成功而任务文档失败时计数可能暂时漂移，下一次服务门面命令/mutateTask、执行器收尾或启动恢复会校准；磁盘持续不可写时无法完成修复。Eagle 库写入和整理结果保存也不构成事务，基础设施错误会向上传播。库内条目批量编辑逐项返回成功或带身份/原因的错误（404 不存在、409 不可用或改名冲突、500 写入失败），服务仅确认成功项；已完成项的库变更收尾不因后续项失败而跳过。改名后元数据写入失败会尝试恢复文件名，无法恢复时明确报错并要求检查。物理删除原文件失败保留索引，可重建缩略图缓存清理失败仅记录。
- **追加数量与去重**：按当前选择范围的可分类图片 ID，与任务 `itemIds` 及本轮已有结果 ID 的并集做集合差；不能用“当前图片总数减历史入队总数”。同一 Eagle ID 即使属于多个文件夹、已移动或已确认/跳过，本轮只添加一次；并发追加必须在 `mutateTask` 内对最新队列去重。去重按 Eagle ID，不按文件内容，不同 ID 的相同图片仍会独立处理；任务完成后新一轮可重新添加。
- **归属变动**：分析仅写整理结果，不自动移动 Eagle 图片。确认按图片 ID 更新当前 metadata，将 `folders` 整体替换成最终选择（或空数组），不依赖来源文件夹；确认前归属发生变化不会产生新图片，但其当时的文件夹归属会被这次确认覆盖。外部 Eagle 客户端改动仍需手动刷新索引；应用内写锁不约束外部客户端的同时写入。
- **分类响应**：视觉响应严格为 `{ title, folderPaths, lowQuality }`；`folderPaths` 必须是分类标准中的 0～3 个不重复路径，按推荐程度排序，空数组是合法成功结果；标题生成后自动追加 `_【模型第一个词】【模型数字】`（如 `_gemini3.7`、`_gpt5.6`）标识起标题的模型。
- **结果查询与校准**：`GET /organize/results` 仅投影结果，不进入用户命令锁。`POST /organize/results/reconcile` 在命令锁内校验 taskId 并处理缺失成功项；确认页每次进入或任务身份变化时显式调用，完成后刷新状态。普通排序与 SSE 拉取只查询列表。单图确认仍可处理已删除项。
- **确认写库**：单张与批量共用 `confirmation.ts`，允许 AI 候选或手动选择目标，显式 `folderId` 优先于标准快照路径，真实目标必须仍存在；未分类写入空 `folders`。可选标题清理非法字符并截断至 120 字符；重名时追加 ` (1)`～` (99)`，原文件与缩略图随之重命名。资源库索引有效且条目已消失时自愈为 `confirmed`；索引不可用不视为图片删除。重复确认已 confirmed 项返回成功且不再写库/扣减；批量请求按 ID 去重并逐项返回结果，同批内重复 ID 使用首个决策。前端按 `taskId` 分组延迟批次，单图操作和乐观记录也绑定相同身份，后端拒绝旧任务的修改请求。
- **前端刷新与步骤装配**：普通资源列表使用请求序号保护和目标页记录，切换文件夹/排序或翻页时旧响应不能覆盖新列表。`libraryRefresh.ts` 合并 100ms 窗口内的主动刷新与 SSE，整理弹窗期间仅记脏。`refreshQueue.ts` 串行合并请求，刷新期间再次失效补拉一轮，Promise 等待全部补拉；`useOrganizeTask` 与 `useRunningTask` 共用该语义，卸载和任务轮次变化时丢弃旧响应。`statusRefresh.ts` 独立管理整理订阅、3 秒节流和快照版本；`statusModel.ts` 负责纯状态转换。`ResourceGridItem` 仅展示卡片，`useResourceActions` 管条目命令和文件夹弹窗。
- **前端职责**：`useClassifyTask` 管准备数据、新建/追加判断、选项保存和标准同步；准备请求在范围/轮次变化及卸载时失效。`useConfirmSelection` 管推荐/手动目标、置顶、默认选择与每图标题开关，`useManualFolders` 仅管历史及频次，按文档最新状态更新避免连续操作使用旧闭包。目录展开与手动历史共用 `EaglePreferenceDocument` 串行保存，同一文档在多个组件实例间共享版本和快照。快速模式继续按首推荐确认，普通模式应用当前选择，标题开关按图片保留。接口请求/响应类型来自 Hono RPC，实际共用的响应模型与纯函数保留在 shared，设置类型由服务端 schema 推导，文件夹选择类型由前端 `folders.ts` 拥有。追加请求的来源与排序为可选，接口默认值由服务端 schema 归一化。
- **前端提交与校准**：`useConfirmResults` 管理列表、排序与统一移除/恢复；`useConfirmSubmission` 管理提交和逐项失败反馈；`submissionQueue.ts` 保留满 20 项或 3 秒防抖，批次与单图命令共用串行链，flush 等待已发请求与当前待发批次，卸载时沿用该队列提交。部分成功仅恢复失败项并按当前排序归位。`store.ts` 保留服务端快照，通过 `statusModel.ts` 以按 ID/任务轮次记录的本地操作派生待确认数量，失败删除操作记录即可回补；提交期间延后状态刷新，提交后拉取校准并清除已完成操作，phase 始终采用服务端结果。确认页面保持 SSE 订阅，新分析结果可继续进入列表。
- **重新执行**：单图 retry 重置为 `pending` 并回退相应计数，执行器继续派发，步骤 3 不跳出。

## 样式约定

- 网格格子：`aspect-square` + `object-cover` + `loading="lazy"`，参考 `GalleryImageGrid`
- 页面高度：页面根用 `h-[calc(100dvh-61px)] md:h-dvh`（移动端扣除顶部导航高度），左右栏内部滚动
- 暗色：沿用 `dark:` 前缀类（`html[data-theme='dark']` 映射）

## 修改指南

- **配置状态**：模块级 store 位于 `settings/`，`SettingModal/` 仅负责表单和弹窗。资源库配置保存失败向上传递，由表单提示并保留弹窗，不触发成功提示或列表刷新。
- **确认视图与删除**：两种确认视图通过 `StepConfirm/utils/list.ts` 构造分类标题和图片的平铺列表，组件只负责展示和视口尺寸；排序工具直接从 `utils/sort.ts` 导入，不经 UI 组件转导出。删除后跳过由 `useConfirmQueue.trashItem` 调用单个 `/organize/results/:itemId/trash` 命令，绑定弹窗打开时的条目 ID 和任务 ID；服务端先校验任务，再执行删除与跳过，条目缺失可继续跳过，资源库不可用返回 409，网络或写盘失败恢复待确认项，不显示删除成功。请求错误通过 `ApiError.status` 保留 HTTP 状态。
- **目录纯逻辑**：库内节点查找、目录树投影、完整路径和分类标准构造放在 `library/folders.ts`，输入目录快照，不读取索引或磁盘。`query.ts` 负责获取索引和组织查询，文件夹写操作直接复用纯函数。
- **加列表字段**：改 `src/shared/eagle/types.ts` 的 `EagleItem` + `src/server/module/eagle/library/query.ts` 的 `toEagleItem`；若需持久化到索引缓存，同步改 `src/server/module/eagle/library/types.ts` 的 `EagleItemIndex` 和 `scan.ts` 的 `buildIndexEntry`（旧缓存缺字段时要有默认值兜底，或考虑清缓存逻辑）
- **加排序维度**：扩展 `EagleSortBy` + `library/query.ts` 中 `getItems` 排序逻辑 + `Toolbar` 选项（注意 localStorage 里旧值要能正常解析）
- **媒体处理**：业务逻辑放在 `module/eagle/media/`；路由仅处理参数、HTTP 条件请求、Range 与响应。回退缩略图生成和删除统一使用 `media/cache.ts`，避免缓存路径各自维护。
- **加 API**：`src/server/api/eagle/library.ts` 或 `organize.ts` 内新增，保持信封结构和 id 校验；链式注册以保留 AppType 推导；参数在 `module/eagle/schemas.ts` 定义或使用路由内 zod schema，前端在 `api.ts` 经 RPC 加封装
- **公共接口**仅从 `library/index.ts` 消费业务查询与写操作；整理用 `getItemPresence` 区分不可用/存在/缺失，批量列表用 `getItemSnapshots` 按需取独立摘要，详情用 `getItemDetail`，视觉判定用 `getItemMediaSource`，不公开内部索引条目或分次解析媒体路径。扫描、可变索引和分片保存只能由 library 内部使用。
- **写库操作**经 `library/index.ts` / `operations.ts` 门面调用；实现分别位于 `folder-operations.ts`、`item-operations.ts` 和 `trash-operations.ts`，条目修改通过 `withLibraryMutation` 统一加锁与收尾（先加载指纹，成功项登记后在 finally 同步缓存与事件）。批量条目结果按 ID 消费，不能按数组位置或把写盘错误当作不存在；不要在其他地方直接写库目录；不要复用 `common/static` 的 `serveImage`（整读 Buffer 不支持 Range）
- 改完同步更新本文档并格式化本次变更，最后运行 `npx tsc --noEmit`
