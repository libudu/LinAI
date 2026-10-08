# Eagle 图片管理模块

浏览 Eagle 资源库（`.library` 目录）中的图片、GIF 和视频，支持文件夹导航、排序、预览、条目编辑、回收站、HEIC/HEIF 格式转换与 AI 图片整理。本应用的配置、缓存和整理任务存放在 `data/eagle/`；编辑、回收站操作、格式转换、分类确认与递归仅重命名的自动执行会写入 Eagle 库。修改本模块后请同步更新本文档。

## 文件结构

```text
src/shared/eagle/
├── types.ts                  # 文件夹、条目、排序与虚拟文件夹常量
└── organize.ts               # 整理契约与分类提示词

src/server/module/eagle/
├── settings.ts               # 资源库与视觉接入点设置
├── storage.ts                # 目录展开、手动分类历史的通用存储注册
├── schemas.ts                # 请求参数 schema 与服务参数类型
├── errors.ts                 # 结构化业务错误
├── relay.ts                  # eagle.vision 请求中继注册
├── concurrency.ts            # 共享并发池
├── change-journal.ts         # 库与整理结果的增量变更记录
├── media/                    # 原文件、缩略图与导入图库
│   ├── index.ts              # 媒体服务
│   ├── heic.ts               # 静态 HEIC/HEIF 识别、WASM 解码与原分辨率 WebP 验证
│   └── cache.ts              # 回退缩略图缓存规则
├── library/                  # Eagle 库索引与读写
│   ├── index.ts              # 对外业务门面
│   ├── types.ts              # 原始/索引模型与操作参数
│   ├── runtime.ts            # 库级写锁与变更资源注册
│   ├── index-state.ts        # 索引生命周期与切库
│   ├── scan.ts               # 全量与增量扫描
│   ├── shard-cache.ts        # 分片缓存恢复与持久化
│   ├── mtime-state.ts        # 库根修改指纹合并
│   ├── folders.ts            # 目录树纯逻辑
│   ├── query.ts              # 查询、投影与排序分页缓存
│   ├── operations.ts         # 写操作聚合
│   ├── folder-operations.ts  # 文件夹编辑
│   ├── item-operations.ts    # 条目编辑与改名回滚
│   ├── conversion.ts        # 全库格式候选、安全替换与源图删除重试
│   ├── trash-operations.ts   # 软删除、还原与彻底删除
│   └── mutation.ts           # 写锁与索引、缓存、事件收尾
└── organize/                 # AI 图片整理
    ├── constants.ts          # 并发、压缩与失败处理常量
    ├── model.ts              # 任务模型与旧数据归一化
    ├── storage.ts            # 私有任务/结果存储与缓存
    ├── transitions.ts        # 阶段、计数转换与校准
    ├── executor.ts           # 队列执行、自动改名、暂停恢复与通知
    ├── vision.ts             # 图片压缩、模型调用与响应校验
    └── service/              # 串行化用户命令
        ├── index.ts          # OrganizeService 单例门面
        ├── types.ts          # 服务参数与返回类型
        ├── helpers.ts        # 视图转换与变更发布
        ├── task.ts           # 任务生命周期
        ├── queue.ts          # 队列与失败项操作
        ├── confirmation.ts   # 单张/批量共用确认计划
        └── result.ts         # 结果查询与操作

src/server/api/eagle/
├── index.ts                  # /api/eagle 路由聚合
├── library.ts                # 资源库与媒体 HTTP 接口
├── organize.ts               # 整理任务与结果 HTTP 接口
└── validation.ts             # 参数校验与统一响应封装

src/client/pages/module/Eagle/
├── index.tsx                 # 页面布局、配置加载与库变更订阅
├── api.ts / rpc.ts           # Hono RPC 与文件 URL 封装
├── store.ts                  # 资源列表、分页与展示状态
├── settings/                 # 资源库与视觉接入点配置 store
├── SettingModal/             # 设置表单与弹窗
├── preferences.ts            # localStorage 展示偏好
├── preferenceTypes.ts        # 前端拥有的偏好模型
├── preferenceDocument.ts     # 通用集合偏好的共享加载与串行保存
├── folders.ts                # 前端目录纯逻辑
├── libraryRefresh.ts         # 合并 SSE 与主动刷新
├── refreshQueue.ts           # 串行刷新与失效补拉
├── FolderTree/               # 目录树、编辑与展开偏好
├── ResourceGrid.tsx          # 网格、分页与媒体预览
├── Toolbar.tsx               # 搜索、展示选项、刷新、整理与文件夹抽屉
├── components/               # 资源卡片、文件夹选择与删除确认
├── hooks/useResourceActions.ts # 条目操作与弹窗状态
└── Organize/
    ├── index.tsx / StepNavBar.tsx # 整理弹窗与步骤导航
    ├── api.ts                # 整理任务与结果 RPC 封装
    ├── StepClassify.tsx       # 待添加：来源、标准与执行参数
    ├── StepFormatConversion.tsx # 可选格式转换：全库分页、批量、失败重试
    ├── hooks/                # 任务快照、新建/追加准备与格式转换队列
    ├── StepRunning/          # 处理中：队列、失败项与执行控制
    ├── StepConfirm/          # 待确认：普通/快速模式
    │   ├── index.tsx / types.ts # 视图装配与类型
    │   ├── components/       # 图片、分类面板与操作栏
    │   ├── hooks/            # 结果同步、选择、提交与快捷键
    │   └── utils/            # 列表、排序、偏好与提交队列
    ├── statusModel.ts        # 乐观操作与展示计数派生
    ├── statusRefresh.ts      # 状态订阅、节流与版本保护
    └── store.ts              # 整理状态与操作门面
```

注册点：

- 前端路由：`src/client/routes.tsx` 的 `/eagle`；后端：`src/server/index.ts` 的 `/api/eagle`。
- 设置、存储、中继分别在 `src/server/common/{settings,storage,relay}/resources.ts` 汇总模块注册。
- 变更资源：`eagle.library` 通知库变更，`eagle.organize` 通知整理任务与结果变更。

## Eagle 库与本应用数据

```text
<库>.library/
├── metadata.json            # 嵌套文件夹树
├── mtime.json               # { 条目ID: lastModified } 修改指纹
└── images/<id>.info/
    ├── <name>.<ext>         # 原文件
    ├── <name>_thumbnail.png # Eagle 缩略图（可能不存在）
    └── metadata.json        # 条目属性、folders[] 与 isDeleted
```

条目归属记录在条目 metadata 的 `folders[]` 中，文件夹自身不保存成员列表。

| 数据                                 | 存储方式 / 位置                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 库路径、视觉接入点                   | SettingsRegistry：`eagle` / `eagle-vision`                                                                                                        |
| 目录展开、手动分类历史               | 通用集合：`eagle.folder-tree` / `eagle.manual-folders`，各使用固定 `preferences` 条目；落盘 `data/eagle/folder-tree.json` / `manual-folders.json` |
| 整理任务、结果                       | 私有 DocumentStore / EntityStore：`data/eagle/organize/task.json`、`items/<itemId>.json`                                                          |
| 索引、回退缩略图                     | 可重建缓存：`data/eagle/index-shards/`、`data/eagle/thumb/`                                                                                       |
| 排序、图片大小、展示选项、选中文件夹 | localStorage，由 `preferences.ts` 管理                                                                                                            |

偏好模型由前端拥有；任务模型由服务端 `organize/model.ts` 拥有。旧格式在存储边界归一化，目录展开的旧 localStorage 记录仅在迁移写入成功后删除。

## 索引与刷新

- 启动优先恢复 32 个分片缓存，无缓存时全量扫描；启动校验与手动刷新通过 `mtime.json` 和目录列表识别变化，仅重读变动条目。指纹缺失时回读元数据。
- 写库成功后立即更新内存索引与查询缓存，修改指纹和脏分片采用 5 秒防抖持久化；指纹保存需合并外部改动，不覆盖本应用待写记录。格式转换在删除源图前同步保存指纹与分片，收尾仅发布事件。切库及清除库配置会等待旧库写锁。
- 过滤、计数和排序在内存完成，按库版本缓存目录概览与排序视图，翻页仅切片。已删除条目保留在索引中供回收站使用。
- 外部 Eagle 改动需手动刷新，目前无文件监听；应用内写锁不约束外部 Eagle 客户端。
- 库与整理结果分别记录增量变更，游标包含服务启动期标识；游标过期、服务重启或整体失效时返回完整快照。

## API（/api/eagle）

参数的完整定义见 `schemas.ts` 与 API 路由，前端类型由 Hono RPC 推导。

| 方法   | 路径                                                                    | 说明                                                                         |
| ------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/overview` / `/folders`                                                | 目录树；overview 另含虚拟分类计数；`count` 为直接成员数，`totalCount` 含子孙 |
| PUT    | `/folders/:id`                                                          | 编辑名称、描述                                                               |
| GET    | `/items`                                                                | 按文件夹、keyword 文件名过滤、排序、offset/limit 分页；未指定文件夹为全部    |
| PUT    | `/items/:id`                                                            | 修改归属、标题                                                               |
| DELETE | `/items/:id` / `/items/:id/purge`                                       | 移入回收站 / 彻底删除                                                        |
| POST   | `/items/:id/restore` / `/trash/purge`                                   | 还原条目 / 清空回收站                                                        |
| POST   | `/unclassified/trash`                                                   | 将全部未分类条目移入回收站                                                   |
| POST   | `/refresh`                                                              | 增量校验，切库时重建索引                                                     |
| GET    | `/conversion/candidates`                                                | 全库 HEIC/HEIF 分页候选；`snapshot=true` 返回完整候选 ID 与简要信息          |
| POST   | `/conversion/items/:id`                                                 | 携带 `libraryId` 单张转换；源图保留时同接口安全重试删除                      |
| GET    | `/items/:id/thumbnail` / `/items/:id/file`                              | 缩略图 / 原文件；原文件支持 Range                                            |
| GET    | `/items/:id/preview`                                                    | 只读大图预览；HEIC/HEIF 按需解码为全尺寸 WebP，不支持时回退缩略图            |
| POST   | `/items/:id/add-to-gallery`                                             | 导入输入图库                                                                 |
| GET    | `/organize/prepare`                                                     | 按 `classificationMode` 返回分类标准与当前范围可追加数量                     |
| GET    | `/organize/status` / `/organize/task`                                   | 轻量状态 / 任务详情                                                          |
| POST   | `/organize/task` / `/organize/task/append`                              | 新建 / 追加任务                                                              |
| POST   | `/organize/task/pause` / `/organize/task/resume`                        | 暂停派发 / 恢复执行                                                          |
| POST   | `/organize/task/sync-standards`                                         | 非运行、未结束任务同步分类标准                                               |
| POST   | `/organize/task/retry-failed` / `/organize/task/skip-failed`            | 重试 / 跳过失败项                                                            |
| POST   | `/organize/task/classify-successful`                                    | 暂停时仅保留成功图片进入确认                                                 |
| POST   | `/organize/task/clear`                                                  | 中止请求并清空任务与结果                                                     |
| GET    | `/organize/queue` / `/organize/failed-items`                            | 队列预览 / 失败详情                                                          |
| GET    | `/organize/results` / `/organize/results/:itemId`                       | 分页结果 / 单图详情                                                          |
| GET    | `/organize/results/changes`                                             | 成功结果增量同步：`items`、`removedIds`、版本与 `reset`                      |
| POST   | `/organize/results/reconcile`                                           | 显式校准缺失条目                                                             |
| POST   | `/organize/results/confirm-batch` / `/organize/results/:itemId/confirm` | 批量 / 单图确认写库                                                          |
| POST   | `/organize/results/:itemId/trash`                                       | 移入回收站并跳过                                                             |
| POST   | `/organize/results/:itemId/skip` / `/organize/results/:itemId/retry`    | 跳过 / 重新执行                                                              |
| POST   | `/organize/results/:itemId/clear-classification`                        | 清除归属并跳过，转为手动处理                                                 |

接口约定：

- `/overview`、`/folders`、`/items` 支持 `mediaType=image|video` 查询参数，目录和虚拟分类计数、搜索、排序及分页统一按媒体类型过滤。`/trash/purge` 与 `/unclassified/trash` 使用同一查询参数限制批量操作范围；未传参数的兼容调用保持全库语义。
- 成功信封 `{ success: true, data }`，错误信封 `{ success: false, error: { code, message } }`；校验错误返回 400，任务身份冲突返回 409 / `TASK_CHANGED`，存储错误保留原错误码。
- 条目 ID 校验 `^[A-Za-z0-9]+$`，文件路径从索引获取。媒体接口支持 ETag，原文件接口另支持 Range；列表提供由库路径、原文件名与 `lastModified` 派生的 `contentVersion`，原文件、缩略图与预览 URL 的 `v` 参数及 ETag 使用此版本。无版本或旧版本 URL 必须重新验证，应用回退缩略图按版本缓存。
- 新建任务携带 `expectedTaskId`（无任务时为 null）；其他任务修改命令携带 `taskId`，在用户命令锁内先校验身份。
- GET 查询不修改任务或计数；缺失结果校准通过 POST `/organize/results/reconcile` 显式执行。

## 前端数据流

1. 页面加载库与视觉配置；有库路径时初始化目录概览，校验上次选中文件夹并获取第一页资源（每页 100）。文件夹树顶部使用与整理分类模式相同的 antd Segmented 组件，图片/视频左右等宽切换，贴边占满顶部宽度，无外围间距和控件内侧留白，固定在滚动区域外；默认图片（含 GIF），图片和视频按对应扩展名集合筛选，其他资源不混入图片标签。切换类型保留当前目录、搜索与排序，回到第一页并重新查询列表和目录计数；旧请求不能覆盖新类型。
2. 工具栏左侧支持当前文件夹的文件名关键词搜索，回车或点击搜索按钮执行，清空恢复完整列表；去除首尾空白且不区分大小写，关键词按空白分隔，文件名必须同时包含所有关键词（如 `A B` 匹配同时包含 A 和 B 的文件名，多余空白忽略）。服务端先过滤再排序、分页，覆盖当前文件夹的全部资源。搜索词不持久化，切换文件夹、排序、翻页和刷新时沿用当前搜索词；修改搜索词回到第一页。搜索时工具栏中的当前文件夹数量显示匹配总数，清空恢复原数量，文件夹树计数始终保留完整数量。请求序号保护当前列表，旧响应不能覆盖新状态。
3. 库写操作后，`libraryRefresh.ts` 合并主动刷新与 SSE，静默更新目录和当前页；整理弹窗期间记脏，关闭后补拉。`refreshQueue.ts` 合并请求并处理刷新期间再次失效。
4. 展示选项和刷新按钮位于工具栏右侧、图片整理按钮左边。图片整理按钮及任务徽标仅在图片标签的普通文件夹下显示，「全部」「未分类」「回收站」三种特殊视图隐藏该入口。展示选项包含文件夹树、显示空文件夹、文件夹描述、文件名和文件大小；「显示空文件夹」紧接「显示文件夹树」，默认勾选并保存到 localStorage，旧偏好缺少此项时也默认勾选。取消后隐藏当前类型递归总数为 0 的真实文件夹，自身为空但子孙有文件的父目录保留；完整目录结构仍供归档选择与整理使用，虚拟导航入口保留。目录树有子目录且直接文件数非零时显示 `直接数量/递归总数`（如 `1/100`），无子目录或直接文件数为零时仅显示递归总数。桌面目录树宽 260px，默认显示；隐藏或使用移动端时，通过工具栏抽屉切换文件夹和媒体类型。未分类批量移入回收站与回收站批量彻底删除仅操作当前标签类型。
5. 目录展开与手动分类历史由 `EaglePreferenceDocument` 共享加载、订阅和串行保存，保留 revision 冲突检测与加载中操作重放。
6. 网格大图预览在底部工具栏上方显示完整文件名（含扩展名），长名称可换行、滚动查看；非回收站视图的工具栏末尾提供红色垃圾桶图标的移入回收站按钮，无需二次确认，成功后 toast 提示、关闭预览并刷新列表，失败时保留预览并提示错误。右键菜单继续使用删除确认弹窗。

分类整理包含三个步骤；无任务或结果时对应步骤置灰。递归仅重命名仅使用「01 待添加」「02 处理中」，不展示「03 待确认」：

三步之前有不编号的 **格式转换** 附加入口，不改变默认打开步骤。列表始终查询全库未删除的 HEIC/HEIF（扩展名不区分大小写），不随当前文件夹变化。每页 50 张，支持单张转换、全库转换、单张/全部失败项重试、进度和停止。前端批量开始时取得全库候选快照，按目录顺序派发、最多 3 张并发；解码/编码可重叠，后端提交由库写锁串行保护。失败记录文件名、原格式和具体原因，继续后续条目；库身份变化时停止派发。关闭弹窗、卸载或切库后停止派发，已发出的请求各自完成；重新打开重新查询剩余候选。失败详情仅在当前弹窗内保存。已提交 WebP 的条目（含源图保留警告）立即在前端移出候选并更新进度，批量列表从快照补齐分页，不逐张重新请求。批次结束或停止并等待在途请求后统一补拉候选分页，并仅通知一次「待添加」更新可分类数量，由用户自行加入分类。

格式转换使用 antd Tabs 切换待转换与失败/源图保留列表，标签按内容宽度展示。列表在普通宽度下每行两项，窄屏单列；文件名保留扩展名，下方显示所属 Eagle 目录的完整路径（多个目录一并显示，无归属显示「未分类」），长路径悬停查看。分页候选和批量快照均携带目录路径，失败列表沿用对应快照。缩略图使用 antd Image，点击可预览并切换当前页图片。HEIC/HEIF 大图预览按需只读解码为全尺寸 WebP，无法可靠解码时放大已有 Eagle 缩略图，不修改原文件或元数据。

每次打开整理弹窗或切库时，复用候选列表的首次查询检查全库是否存在待转换 HEIC/HEIF；查询完成前不展示入口，无候选时隐藏「格式转换」入口和内容。查询失败时保留入口，便于查看错误和重试；本次打开已有候选时，转换完成后仍保留入口供查看进度与失败结果，下次打开再重新检查。

待转换列表在全库候选中先按 Eagle 原目录树顺序排序（父目录先于子目录，同级沿用库中的顺序），再分页；批量转换快照沿用相同顺序。属于多个目录的图片按最靠前的归属目录定位，同目录内保留现有条目顺序，未分类或没有有效目录的条目放在最后。

- **待添加**：图片来源为当前选中文件夹，新建任务时选择分类模式与执行参数。默认「全局分类」沿用全库所有有描述的文件夹；「子目录分类」仅使用当前文件夹下所有层级中有非空描述的子目录，不包含当前文件夹本身，并保留完整目录路径与原有分类优先级。「递归仅重命名」检查当前文件夹及全部子孙目录，按现有模型标识规则筛选需要重命名的图片，无需文件夹描述，默认处理数量为当前范围全部可处理图片，可手动调整数量。切换模式时分类列表与提示词预览同步更新，分类模式没有有效分类目录时确定按钮置灰。已有未完成任务时可跨文件夹追加，沿用当前任务的分类模式、标准、并发与压缩设置，模式不可切换；仅重命名追加也递归检查新来源文件夹，并按 Eagle ID 去重；子目录分类的目标范围始终绑定创建任务时的文件夹，旧任务按全局分类兼容。
- **处理中**：查看队列、进度与失败项，支持暂停、恢复、重试、跳过和清空。执行器限制并发与请求间隔，连续失败或落盘异常时暂停并通知。递归仅重命名逐张生成标题后直接修改文件名，成功写库后标记为 `confirmed`，不进入手动确认；改名失败进入本步骤的失败列表，可重试或跳过。全部处理完成后显示完成提示与继续添加入口；清空任务仅停止后续处理、清除记录，已修改的文件名保留。
- **待确认**：分类任务仅展示判定成功项。普通模式支持推荐/手动目标与标题选择；快速模式按首选推荐分类确认。分类排序保持任务内顺序，疑似低质与未分类置顶。支持清除分类、跳过、移入回收站和重新执行。选择或执行递归仅重命名模式时隐藏「03 待确认」导航（含移动端）及所有确认入口，完成通知也不提示查验结果。

「待添加」切换到递归仅重命名时，原分类文件夹预览区域改为待重命名图片列表，复用「02 处理中」的缩略图与文件名行样式，以序号替代执行状态。`/organize/prepare` 的 `previewItems` 仅在此模式返回，按当前来源排序展示前 50 条尚未入队的候选，并显示可添加总数；追加时排除任务队列与本轮结果中的历史 ID。切换目录、排序、模式及格式转换后，预览与准备计数一起刷新，沿用准备请求的过期响应保护。预览上限不限制实际处理数量。

确认页通过增量接口同步结果，排序在本地完成；进入确认页或任务身份变化时显式校准缺失条目。全部执行完且待确认、失败项均已处理后，任务进入 `done`。

子目录分类的「03 待确认」普通模式默认列出任务创建时绑定目录下的全部层级子目录，不含绑定目录本身，包含没有描述、没有手动使用记录的子目录。置顶选项保持优先，其余先按 AI 推荐顺序展示，再按手动使用次数降序排列（次数相同沿用目录树顺序），推荐与手动项按路径去重；首次直接选择子目录确认时也会保存使用记录。全库的其他手动历史不混入默认候选。点击「手动选择文件夹」仍打开全库目录树，显式选择的范围外目录可用于当前图片，也可置顶复用。候选范围不随后续追加图片的来源目录变化，全局分类的候选逻辑保持原样。

子目录分类按图片已预先筛选的场景设计，不判定或展示「疑似低质」；模型意外返回及旧结果中的 `lowQuality` 均不对外保留。全局分类和递归仅重命名保留低质判断。

## 维护约束

- **格式转换**：`media/heic.ts` 使用 `heic-decode@2.1` 的 libheif WASM 解码与 sharp 编码，输出完整解码尺寸、质量 90 的有损 WebP，不使用分类上传的缩放/压缩配置，不承诺全部 EXIF/HDR 信息保留。libheif 默认处理容器 `irot`/`imir`/裁剪，raw 像素不再应用 EXIF 自动旋转。先严格检查顶层 BMFF 结构与序列品牌/`moov`，再检查 libheif 原始顶层图片数必须为 1（不能仅依赖解码器会跳过错误 handle 的返回数组），多图、序列、损坏或不支持编码均报错并保留源图。
- **转换替换**：库身份绑定到请求，源路径来自可信索引且限制在绑定库 `images/<id>.info/` 内，不跟随库内符号链接/junction。解码编码在锁外；唯一临时文件通过 `wx` 创建、同步写盘后从实际文件完整重新解码。写锁内重新核对库/条目/完整元数据/源文件属性，目标存在即冲突；以硬链接独占放置目标，文件系统不支持硬链接时失败并保留源图。完整原始 metadata 对象只更新 `ext`、`size`、实际宽高与 `lastModified`，同 ID、文件夹、标签、备注、评分、网址、未知字段和导入日期保持。保留 metadata.mtime，并把 WebP 的文件 mtime 设为该值，防止后续编辑从 stat 回填时改变排序。
- **转换删除与回滚**：仅在 WebP 验证、原子元数据写入、索引/指纹/分片保存完成后删除确切源路径；不删除 `.info` 目录、Eagle/自定义缩略图或未知旁文件。提交失败尝试回滚元数据/索引/指纹/分片，只清理本次独占创建且身份、内容仍一致的目标及确切临时路径。外部修改或回滚失败时保留源图并报异常。源图删除失败返回 `sourceRemoved=false` 和明确警告，前端留在失败视图；服务端仅保留最多 1000 个内存操作凭据，重试核对提交版本、路径、源属性、完整元数据和 WebP 哈希后只删除源图，不重新压缩 WebP。服务重启、凭据失效或条目再被编辑后不能自动清理，需检查条目目录；没有持久化转换任务、队列、worker 或启动恢复。

- **写库边界**：通过 `library/index.ts` 门面调用；条目修改使用 `withLibraryMutation` 加锁，成功项的索引、指纹、缓存与事件收尾不受后续失败影响。不要在其他模块直接写库或访问可变索引。
- **失败语义**：批量操作按条目 ID 处理逐项结果，仅确认成功项。改名失败尝试回滚；物理删除失败保留索引。库写入与整理结果保存不是事务，不得将写盘失败当成条目不存在。
- **持久化与计数**：任务读改写经 `mutateTask` 串行化，阶段和计数统一由 `transitions.ts` 处理；缓存仅在写盘成功后发布。部分落盘失败由后续命令、执行收尾或启动恢复校准。
- **追加去重**：当前范围的可分类 ID 减去任务队列与本轮结果 ID 的并集，并在串行更新内再次去重。按 Eagle ID 去重，同轮已确认/跳过项不重复追加。
- **分类与归属**：分类任务分析只保存结果，确认才替换条目的 `folders[]`。候选为标准中的 0～3 个不重复路径；空数组合法。分类响应包含 `folderPaths`，需重命名时另含 `title`；全局分类要求 `lowQuality`，子目录分类不要求并丢弃该字段。标题由服务端追加模型标识。递归仅重命名响应为 `{ title, lowQuality }`，忽略意外返回的分类建议；执行器复用 `confirmation.ts` 生成仅改名计划后自动写库，不传 `folderIds`，保留最新元数据的全部归属，服务端拒绝清除分类命令。此模式下入队后已符合当前模型命名规则的图片在执行或重试时直接完成，不再调用模型或改名。

- **自动改名恢复**：递归仅重命名先持久化 `success` 建议结果，再写库并持久化 `confirmed` 状态，成功计数经过统一转换且待确认数保持为 0；写库失败保存为 `failed`，计入失败暂停阈值。中断时遗留的 `success`（包括旧版待手动确认的结果）在启动恢复后标记任务为重启暂停，用户从 02 继续即可复用已有建议写库，无需再次调用模型；写入前重新检查当前名称，已匹配当前模型时不重复改名。库已改名但最终状态未保存时也按此流程恢复。强制清空通过执行轮次检查阻止尚未开始的写库，等待已开始的写库收尾后删除任务记录。
- **按模型跳过重命名**：每次执行（包含重试）以条目当前名称按 `_` 分段，最后一段中的模型名称与当前生效接入点提取的首个英文词相同（忽略版本号与大小写）时无需重命名；模型名称不同或末段不符合模型标识格式则重新生成标题。例如 `_gemini3.7` 对当前 `gemini-3.8-flash-high` 无需改名，`_GEMINI3.7` 同样匹配；`_gpt5.6` 对当前 Gemini 仍需改名。新标题的后缀仍先去掉 provider 路径前缀，再提取首个英文词与版本数字，版本中的 `-` 转为 `.`；例如 `gemini-3.7-flash-high` → `gemini3.7`、`gpt-5.6-terra` → `gpt5.6`、`claude-3-7-sonnet` → `claude3.7`。继续兼容已有缩略标识；同系列的不同版本、不同变体均视为相同模型名称。无需重命名时 system/user 提示词均省略标题相关要求，不校验或保留意外返回的标题、不追加模型标识，结果保存 `needsRename: false`。确认页隐藏建议标题与重命名勾选项，普通/快速确认均不提交重命名意图；后端确认再次检查当前名称、当前模型与结果标记，分类任务只修改分类归属，递归仅重命名任务保留原归属。旧结果也按当前名称及模型处理，仍需重命名的图片沿用原流程。提示词预览支持查看「分类并重命名」与「仅分类」两个版本。成功计数校准不再依赖必须存在标题，仅分类的成功图片跳过后仍计入成功数。递归候选筛选、执行判定与确认均共用此规则。
- **分类范围**：`/organize/prepare` 与新建任务接受 `classificationMode=global|subfolders|recursive-rename`（省略时为 `global`）；子目录分类缺少有效父目录或有描述子目录时返回空标准，服务端拒绝创建；递归仅重命名允许空标准，但缺少有效来源目录时返回空候选，禁止扩大到全库。任务、详情及轻量状态保存分类模式，分类标准差异检测和「同步最新文件夹」均使用任务创建时绑定的分类范围，避免子目录任务同步后扩大到全库；仅重命名不检测分类标准差异。
- **模型标识一致性**：单张分类绑定服务端接入点快照，提示词判断、实际请求模型和标题后缀使用同一个模型 ID，处理中修改配置不影响已发出的请求。标题生成时在名称 120 字符上限中为模型后缀预留空间，避免落库截断后反复触发重命名。
- **确认幂等**：单张与批量共用 `confirmation.ts`；显式 `folderId` 优先于快照路径，目标必须存在。重复确认不再写库或扣减计数；索引不可用与条目缺失必须区分。
- **增量同步**：重置时替换本地结果，否则按 ID 合并/移除；仅在接受响应后推进游标。任务切换、卸载和乐观操作后，过期响应不得覆盖当前状态。
- **提交与恢复**：`submissionQueue.ts` 串行化批量和单图操作，按任务身份分组提交；失败仅恢复对应项。`statusModel.ts` 派生乐观计数，服务端决定任务阶段，提交后重新校准。
- **前端职责**：`useClassifyTask` 管新建/追加准备，`useConfirmResults` 管结果列表，`useConfirmSelection` 管选择，`useConfirmSubmission` 管提交，`useManualFolders` 管手动历史。UI 组件负责展示，业务命令放在 hooks/store。
- **类型来源**：请求/响应由 Hono RPC 推导，设置由服务端 schema 推导；仅实际共用的契约和纯函数放在 shared，旧数据兼容留在存储边界。

## 修改指南

- 加列表字段：修改 `shared/eagle/types.ts` 的 `EagleItem` 与 `library/query.ts` 的 `toEagleItem`；需缓存时同步索引类型、`scan.ts` 与旧缓存默认值。
- 加排序维度：修改 `EagleSortBy`、`library/query.ts` 和 `Toolbar`，兼容旧 localStorage 值。
- 加 API：在 `api/eagle/library.ts` 或 `organize.ts` 链式注册，参数用 zod 校验，前端分别在 `Eagle/api.ts` 或 `Eagle/Organize/api.ts` 封装。
- 目录纯逻辑放在 `library/folders.ts`；媒体业务放在 `media/`，缩略图缓存规则统一使用 `media/cache.ts`。原文件接口不要复用整读 Buffer 的 `common/static/serveImage`。
- 设置状态放在 `settings/`，表单保存失败向上传递；展示偏好放在 `preferences.ts`，便携业务偏好走通用存储。
- 普通/快速确认视图共用 `StepConfirm/utils/list.ts` 与 `sort.ts`；删除并跳过使用单个 `/organize/results/:itemId/trash` 命令。
- 网格沿用 `aspect-square`、`object-cover` 与懒加载；页面高度使用 `h-[calc(100dvh-61px)] md:h-dvh`，左右栏内部滚动；暗色沿用项目主题映射。
- 解码依赖 `heic-decode` 与 `libheif-js` 保持 tsup external，dist 生产依赖需保留完整包结构；`wasm-bundle` 的 WASM 已内嵌 JS，无需另取网络资源。发布前手动验证 Eagle 客户端刷新与便携运行兼容性。
- 修改后更新本文档、格式化变更，代码完成后仅运行 `npx tsc --noEmit`，不要运行 build 或 eslint。
