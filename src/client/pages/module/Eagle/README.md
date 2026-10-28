# Eagle 图片管理模块

浏览与编辑 Eagle 资源库（`.library`），支持图片/GIF/视频预览、回收站、媒体编辑、HEIC/HEIF 转换、AI 整理及远程只读共享。LinAI 的配置、任务与缓存位于 `data/eagle/`；编辑、转换、整理确认、自动改名和视频联系表生成会写入 Eagle 库。

## 代码入口

| 职责                 | 入口                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------ |
| 页面、浏览状态与刷新 | 本目录 `index.tsx`、`store.ts`、`libraryRefresh.ts`、`refreshQueue.ts`               |
| 整理界面与状态       | 本目录 `Organize/`；确认逻辑位于 `StepConfirm/hooks/`、`StepConfirm/utils/`          |
| 媒体预览与编辑       | 本目录 `components/`；保存入口 `MediaEditSaveButton`                                 |
| HTTP 接口与参数      | `src/server/api/eagle/`、`src/server/module/eagle/schemas.ts`                        |
| 库索引与写入         | `src/server/module/eagle/library/`，对外只用 `index.ts` 门面                         |
| AI 任务与执行        | `src/server/module/eagle/organize/`；`service/` 处理用户命令，`executor.ts` 执行队列 |
| 媒体处理             | `src/server/module/eagle/media/`：`heic.ts`、`edit.ts`、`timestamps.ts`、`video*.ts` |
| 共享授权与传输       | 前后端各自的 `sharing/`；连接由远程互联模块管理                                      |
| 共用契约与提示词     | `src/shared/eagle/`                                                                  |

页面路由为 `/eagle`，业务 API 为 `/api/eagle`。设置、通用存储和中继分别在 `src/server/common/{settings,storage,relay}/resources.ts` 汇总注册。

## 数据归属

模块使用的 Eagle 库结构如下（省略无关文件）：

```text
<库>.library/
├── metadata.json                # 嵌套目录树
├── mtime.json                   # { 条目ID: lastModified } 修改指纹
└── images/<id>.info/
    ├── <name>.<ext>              # 原文件
    ├── <name>_thumbnail.png      # Eagle 缩略图，可能不存在
    ├── metadata.json            # 条目属性、folders[]、isDeleted
    └── linai/                   # LinAI 按需生成的视频联系表及校验信息
        ├── video-contact-sheet.webp
        └── video-contact-sheet.json
```

条目归属由条目 metadata 的 `folders[]` 记录，目录自身不保存成员列表；软删除由 `isDeleted` 标记，条目仍留在原 `.info` 目录。

| 数据                           | 存储                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 库路径、视觉接入点             | SettingsRegistry：`eagle` / `eagle-vision`                                                             |
| 目录展开、手动分类历史         | 通用集合 `eagle.folder-tree` / `eagle.manual-folders`，固定 `preferences` 条目                         |
| 图片/视频整理任务及结果        | 私有 DocumentStore / EntityStore：`data/eagle/organize/{image,video}/task.json`、`items/<itemId>.json` |
| 可重建索引与缩略图缓存         | `data/eagle/index-shards/`、`thumb/`                                                                   |
| 视频联系表及校验信息           | Eagle 条目内 `linai/video-contact-sheet.{webp,json}`                                                   |
| 展示、排序、媒体类型及选中目录 | localStorage，由本目录 `preferences.ts` 管理                                                           |

偏好模型由前端拥有，任务模型由服务端 `organize/model.ts` 拥有；旧数据只在存储边界归一化。旧整理任务迁移由 `organize/migration.ts` 负责并保留旧数据；读取失败或目标冲突不能当作无任务，也不能覆盖进度。

## 索引、接口与同步

- 启动先恢复分片缓存，再校验库；首次查询等待校验完成。刷新按修改指纹增量扫描，指纹缺失时用本地文件属性校验。外部 Eagle 改动需手动刷新，目前没有文件监听，LinAI 写锁也不约束外部客户端。
- 过滤、计数、排序在内存完成，排序视图按库版本缓存，分页仅切片。目录 `count` 为直接成员数，`totalCount` 含子孙；回收站条目仍保留在索引。
- 「操作时间」取条目 `lastModified`，「修改时间」取原文件 `mtime`；库根 `mtime.json` 只用于变更检测。指纹写入需合并外部变更；切库前等待旧库写锁及缓存落盘。
- 图片/视频浏览分别记忆目录。搜索先过滤再排序分页；包含子目录时按目录树分组，多归属条目去重。浏览范围与整理来源独立，普通目录才能新建/追加整理，虚拟目录只能继续已有任务。
- `eagle.library` 与 `eagle.organize.image` / `eagle.organize.video` 通过 SSE 通知变化。库及结果增量游标含服务启动标识，重启、过期或整体失效时返回完整快照；仅接受响应后推进游标。
- 前端刷新需串行合并，请求序号/版本保护必须覆盖切库、切媒体类型、切任务和乐观操作。整理弹窗打开时浏览区记脏，关闭后补拉；便携偏好由 `preferenceDocument.ts` 共享加载与串行保存，保留 revision 冲突检测。

接口参数以路由和 `schemas.ts` 为准，前端通过 `api.ts` / `rpc.ts` 的 Hono RPC 推导类型，不另维护接口清单。业务响应为 `{ success: true, data }` 或 `{ success: false, error: { code, message } }`；任务身份冲突返回 409 / `TASK_CHANGED`，存储错误不得伪装为条目缺失。GET 不修改整理任务或计数，缺失项校准显式使用 POST。

条目 ID 只允许字母数字，媒体路径从可信索引获取。媒体接口支持 ETag，原文件支持 Range，应流式返回；`contentVersion` 用于媒体 URL、缓存和编辑校验，旧版本 URL 必须重新验证。

## AI 整理

图片、视频各有一个独立任务，可同时运行；任务、结果、命令锁、执行器和前端提交批次按媒体类型隔离，共用库写锁与本地视频解码锁。GIF、HEIC/HEIF 不参与图片分类。

| 模式               | 来源与标准                                                     | 写库方式                                 |
| ------------------ | -------------------------------------------------------------- | ---------------------------------------- |
| `global`           | 当前普通目录；全库有描述的目录为标准                           | 分析后手动确认分类与可选改名，含低质判断 |
| `subfolders`       | 当前普通目录；创建目录下全部层级有描述的子目录为标准，不含自身 | 手动确认，不保留 `lowQuality`            |
| `recursive-rename` | 当前目录及全部子孙中需要改名的资源，无需分类标准               | 自动仅改名，保留归属，不进入待确认       |

- **准备**：新建携带 `expectedTaskId`，后续修改携带 `taskId`，在命令锁内校验。追加沿用任务模式、参数和标准，按 Eagle ID 排除队列及本轮全部结果。标准同步仅允许非运行、未结束任务；须先按原标准快照持久化旧路径结果的目录 ID，再替换分类标准。
- **子目录范围**：分类标准限于创建目录下有描述的子目录，默认确认候选包含其全部层级子目录（可无描述，不含创建目录自身），两者均绑定创建目录，追加不改变范围；手动确认仍可选择全库目录。
- **执行**：`mutateTask` 串行读改写，`transitions.ts` 统一阶段和计数，落盘成功后才发布缓存与事件。连续失败或落盘异常暂停；暂停先停止派发，过期执行轮次不得推进任务。清空中止请求、阻止后续写库并等待在途提交收尾，不撤销已写库修改。
- **确认**：分析仅存结果，确认才替换 `folders[]`。单张与批量共用 `service/confirmation.ts`；优先提交稳定目录 ID，目标删除时拒绝确认，不能让同名新目录接管。重复确认不重复写库或扣计数。移至未分类会清空归属、按规则采用推荐标题并跳过结果；仅重命名模式禁止此命令。
- **标题与恢复**：候选筛选、执行和确认共用模型后缀规则；已有同模型系列后缀时跳过改名。单项执行绑定接入点快照，保证提示词、实际模型与后缀一致。自动改名先保存 `success` 建议，再写库并保存 `confirmed`；启动暂停遗留任务，恢复时复用建议并重新检查名称，避免重复调用或改名。库写入与结果落盘不是事务，失败必须保留可恢复状态。
- **前端**：确认目标由 `StepConfirm/utils/folderOptions.ts` 统一派生，列表与排序由 `list.ts` / `sort.ts` 共用。`submissionQueue.ts` 按任务身份串行提交，卸载后仍提交至原任务；失败只恢复对应项。`statusModel.ts` 派生乐观计数，服务端决定最终阶段。

分类响应校验与提示词见 `src/shared/eagle/organize.ts`、`organize/vision.ts`；视觉正文解析共用 `src/shared/vision/response.ts`。

## 媒体写入约束

所有业务写库经 `library/index.ts` 门面和 `withLibraryMutation` 写锁，其他模块不得访问可变索引或直接写库。耗时处理在锁外执行，提交时锁内复核库身份、内容版本、元数据及源文件；拒绝链接和越界路径。批量逐项返回结果，失败不能抹掉已成功项；物理删除失败保留索引。

- **编辑**：请求携带 `contentVersion` 和有序 `operations`，未知操作必须拒绝。当前支持旋转及视频裁剪；裁剪必须另存视频副本。覆盖前创建独立的 Eagle 回收站原文件备份，保留当前条目 ID、名称和归属；保留原文件系统时间及 Eagle `mtime`，但更新 `lastModified` 以驱动内容版本及增量刷新。另存创建新 ID，不修改原条目。具体提交/回滚见 `library/media-edit*.ts`。
- **校验与取消**：实际输出重新读取验证，提交失败尝试恢复文件、缩略图、元数据及索引，回滚失败仍保留备份并报错。视频保存使用内存进度任务，最终提交阶段不可取消，无进程中断自动恢复。提交持久化成功后才清理确切旧文件，不删除未知旁文件。
- **格式与时间**：动画/多页图片拒绝覆盖，其他可解码静态图片必要时转 PNG，视频输出 MP4 并重新编码。只保留明确支持的内部时间字段及文件系统时间，无法等价保留时拒绝保存，不承诺完整 EXIF/HDR 或无损转码；规则与验证集中在 `media/timestamps.ts`、`media/edit.ts`、`media/video-encoding.ts`。
- **HEIC/HEIF 转换**：独立全库流程，只接受单张静态图，生成原分辨率的有损 WebP，不承诺完整 EXIF/HDR 保留。完整验证输出并持久化元数据、索引、指纹及分片后才删除源图；失败保留源图并回滚。源图删除重试只删已验证的确切源文件，凭据仅存内存，无持久化队列。见 `media/heic.ts`、`library/conversion.ts`。
- **视频联系表**：FFmpeg 抽帧、sharp 合成，仅向模型上传联系表，不上传原视频。采样与布局以 `media/video-layout.ts` 为准。联系表是库内长期预览，与任务独立；按源文件指纹、规则兼容版本及 WebP 校验值复用，缺失或失效时按需生成，启动扫描不读取，不改 Eagle 元数据或修改指纹。见 `media/video.ts`、`library/video-contact-sheet.ts`。

## 远程只读共享

权限组、邀请及连接由「远程互联」管理，Eagle 负责库审批、目录授权与只读传输。网络身份、端口隔离及发布约定见 [远程互联文档](../../../../server/module/interconnect/README.md)。

- 加入房间不等于获得库权限，必须经房主明确批准。文件夹权限按本地库隔离，所有人与指定权限组授权取并集；稳定的 `folderSharingCode` 不随权限组改名或重发邀请改变。
- 授权过滤发生在计数、排序、分页之前；详情、缩略图、预览、原文件及 Range 同样校验。未分类、回收站、写操作、整理、导入及库内视频联系表不共享。
- 共享协议独立于主服务，仅开放白名单只读路径，不能暴露本地管理、系统设置或其他模块。系统登录、管理 Cookie 与后端内存 Bearer 会话分离；媒体经请求方后端流式中转，返回 `no-store`。
- 权限改变立即中断旧范围传输；审批/心跳超时、切库、撤销权限组/邀请、关闭房间或核心退出时终止会话，重启不恢复批准。SSE 只观察状态，页面导航或重连不撤销会话。

## 维护约定

- 本文只保留模块边界、数据归属和容易破坏的约束；具体参数、算法、UI 操作及历史兼容细节以对应源码为准，不追加变更流水账。
- 修改列表字段时同步 `shared/eagle/types.ts`、`library/query.ts` 的投影；需要缓存时同步索引模型、扫描及旧缓存默认值。修改排序时同步查询、Toolbar 及旧偏好兼容。
- 设置类型从服务端 schema 推导，只有实际共用的契约和纯函数放 shared。
- `heic-decode` / `libheif-js` / `ffmpeg-static` 保持 tsup external，便携包需包含完整生产依赖、WASM 与 FFmpeg 平台二进制；`exifr` 随服务端打包。原文件接口不要使用整读 Buffer 的 `common/static/serveImage`。
