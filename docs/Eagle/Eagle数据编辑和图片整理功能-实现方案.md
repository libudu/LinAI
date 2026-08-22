# Eagle 数据编辑和图片整理功能 — 参考文档

> 需求原文：`docs/Eagle/Eagle数据编辑和图片整理功能.txt`
> 模块说明：`src/client/pages/module/Eagle/README.md`
> 三阶段（任务基建 / 队列执行 / 结果确认）均已实现，本文档为后续维护参考。

## 功能概述

「图片整理」按钮（`Toolbar.tsx`）弹出的三步流程模态框：

1. **步骤 1 分类文件夹划定**：有描述的文件夹（描述即分类标准，从上到下为优先级）作为标准列表；设置处理数量（默认/上限为当前全部）；仅处理图片（gif / 视频过滤）；默认勾选图片压缩（执行时服务端内存压缩后上传，不落盘）。确定后创建任务，后端建立处理队列。
2. **步骤 2 执行中任务**：队列按 5 并发请求 AI 视觉能力，严格 JSON 返回；单图失败标记为 failed 并暂停队列派发（in-flight 不中断）。状态：执行中 / 已暂停（用户暂停、出错、服务重启）。
3. **步骤 3 结果确认**：顶部待确认缩略图条；左大图、右信息（状态、建议标题、文件夹调整、低质标记、失败原因）；底部操作：不处理（红）/ 重新执行 / 确认（不含标题）/ 确认。操作后自动选下一张。

按钮徽标：running/paused 时显示剩余任务数（点击进步骤 2，不能再新建）；confirming 时显示小红点（点击进步骤 3）。

## 总体设计

- **单任务模型**：同一时间只存在一个整理任务；队列未完成（running / paused）不能再创建，done 后创建新任务时清空旧结果。
- **后端执行**：队列在服务端后台执行（5 并发），不依赖前端在线；进度经 change bus（`eagle.organize` 资源）+ SSE（`/api/storage/events?resources=eagle.organize`）通知前端重拉。
- **私有持久化**：DocumentStore 存任务本体（`data/eagle/organize/task.json`）、EntityStore 每图一个结果文件（`data/eagle/organize/items/`），均不注册到 storageRegistry，前端只能走专用 API。
- **视觉调用**：relay 目标 `eagle.vision`（复用 requestRegistry 的 origin 校验 / 凭据注入 / 超时），接入点配置来自独立的 `eagle-vision` 设置。
- **库写入**：本功能引入对 Eagle 库的第二个写操作 `updateItem`（改条目 metadata.json 的 name / folders，重命名 `.info` 内原文件，同步 mtime.json 与内存索引）；另一个写操作是文件夹编辑 `updateFolder`。

## 数据模型（`src/shared/eagle/organize.ts`）

```ts
// 任务阶段
type OrganizePhase = 'running' | 'paused' | 'confirming' | 'done'
// pausedReason: 'user' | 'error' | 'restart' | null

// 单图结果状态（结果实体在执行完成时才落盘，pending 仅用于「重新执行」）
type OrganizeItemStatus =
  | 'pending'
  | 'success'    // 判定成功，待确认
  | 'failed'     // 判定失败，待确认（上游错误 / 非 JSON / 不属于任何分类）
  | 'skipped'    // 用户选择「不处理」
  | 'confirmed'  // 已确认（是否同时修改标题由确认操作参数决定，不区分状态）

// 分类标准快照（创建任务时固化，顺序即优先级）
interface OrganizeFolderStandard {
  folderId: string
  folderPath: string // 完整路径，如 "插画/风景"，展示与 AI 返回匹配用
  name: string
  description: string
}

// 任务文档（OrganizeTaskRecord）
{
  phase, pausedReason, compress, createdAt,
  standards: OrganizeFolderStandard[],
  itemIds: string[],       // 处理队列，结果实体懒创建的依据
  executed: number,        // 已执行完成数量
  pendingConfirm: number,  // 待确认数量（success + failed）
  successCount: number,
  failedCount: number,
}

// 结果实体（OrganizeItemRecord）
interface OrganizeItemRecord {
  itemId: string
  status: OrganizeItemStatus
  title?: string        // AI 建议标题（success）
  folderPath?: string   // AI 判定目标文件夹（success）
  lowQuality?: boolean  // 疑似低质（success）
  error?: string        // 失败原因（failed）
  attempts: number
  updatedAt: number
}
```

## 后端结构（`src/server/module/eagle/organize/`）

- `storage.ts`：OrganizeRepository，私有 DocumentStore + EntityStore，启动恢复（running→paused/restart）；`mutateTask` 提供任务文档读改写串行化（内存 Promise 队列），service 与 executor 共用模块级单例。
- `service.ts`：prepare / create / pause / resume / 结果读写 / confirm / skip / retry；changeBus 注册 `eagle.organize` 并在变更后 publish。
- `executor.ts`：5 并发池；失败、存储异常均暂停派发（in-flight 不中断）；收尾以结果实体状态为准判断是否重拉队列，finalize 时以实体重算全部计数（防计数与实体脱节导致热循环）。
- `vision.ts`：单图判定。压缩常量独立定义（`EAGLE_VISION_IMAGE_MAX_DIMENSION = 2000`、`EAGLE_VISION_IMAGE_QUALITY = 85`，与 common/static 的常量无关）；prompt 要求仅输出 JSON `{ title, folderPath, lowQuality }`（`folderPath` 必须从标准列表中选），请求带 `response_format: { type: 'json_object' }`；解析时先剥 ```json 围栏再严格 zod 校验。
- `settings.ts`：`getEagleVisionEndpoint()`，镜像 vision 模块的 `getVisionEndpoint`。
- `relay.ts`：注册 relay 目标 `eagle.vision`（POST /chat/completions，非流式）。
- `library.ts`：`updateItem()`（改名 + folders + mtime.json + 索引同步 + 发布 `eagle.library` 变更）、`getClassifiableItems()`（仅图片过滤取前 N）、`folderExists()`。

## API（`/api/eagle/organize`，挂载于 `api/eagle.ts`）

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| GET  | `/prepare?folderId&sortBy&sortOrder` | 步骤 1 数据：standards 列表 + 范围内可处理图片数 |
| GET  | `/status` | 徽标轮询：`{ phase, remaining, pendingConfirm, pausedReason }` |
| POST | `/task` | 创建任务：`{ folderId, sortBy, sortOrder, count, compress }`；队列未完时 409 |
| GET  | `/task` | 任务详情（standards + 计数） |
| POST | `/task/pause` / `/task/resume` | 暂停（in-flight 继续完成）/ 恢复 |
| GET  | `/results?status&offset&limit` | 结果列表（按 updatedAt 倒序，缺省全量） |
| GET  | `/results/:itemId` | 结果详情（`OrganizeResultDetail`，附带条目当前名称 `itemName`） |
| POST | `/results/:itemId/retry` | 重新执行：置 pending，计数回补，phase→running |
| POST | `/results/:itemId/confirm` | `{ withTitle: boolean }`：写库并置 confirmed |
| POST | `/results/:itemId/skip` | 不处理 → skipped |

## 前端结构（`src/client/pages/module/Eagle/Organize/`）

- `index.tsx`：Modal 壳，按任务 phase 路由（running/paused→Step2，confirming→Step3，done→Step1）。
- `StepClassify.tsx` / `StepRunning.tsx` / `StepConfirm.tsx`：三个步骤的 UI。
- `api.ts`：API 封装；`store.ts`：zustand，订阅 SSE 后重拉 status 与当前步骤数据。

Toolbar：「图片整理」按钮外包 antd `Badge`（剩余数 / 小红点）；Eagle 页面 `index.tsx` 订阅 `eagle.library` 变更后重拉文件夹树与当前页。

## 关键实现细节与注意事项

- **结果实体懒创建**：任务文档保存 `itemIds` 队列数组，单图结果实体仅在执行完成时落盘（避免一次性写入上万小文件）；`itemIds` 上万条时任务文档 `maxValueLength` 放宽到 16M。
- **分类标准顺序**：按文件夹树先序遍历（父节点在前、子节点紧随），即 Eagle 界面自上而下 = 优先级从上到下。
- **失败暂停队列**：判定失败（HTTP/网络错误、非 JSON、zod 不通过、folderPath 不在标准中）或存储层写盘异常，均停止派发并置 paused/error；单图重试失败同样暂停整个任务，用户点「继续」后回到 confirming。
- **执行器派发跳过已有非 pending 结果的项**：「重新执行」在已完成前缀中间挖出 pending 项后，其后已完成的项不会被重复执行。
- **retry 的 attempts 与计数**：retry 只置 pending，attempts 由执行器统一 +1；同时 `executed`/`pendingConfirm` 各减一，执行完成后加回。
- **确认写库（updateItem）**：
  - `folders` 为替换语义（移出原文件夹）；确认前校验目标文件夹仍存在（快照可能过期），不存在返回 409。
  - 标题写入前清理 Windows 非法字符、压缩空白、截断 120 字符；重名追加 ` (1)`、` (2)` 序号（超过 99 抛错）；缩略图按 `<name>_thumbnail.<ext>` 跟随重命名。
  - 库根 mtime.json 只在已存在时更新（降级模式不重建部分指纹表）。
- **failed 结果不能确认**：确认页两个确认按钮禁用，后端同样以 409 拦截；仅可「重新执行」或「不处理」。
- **未压缩图片超限**：relay `maxBodyLength` 超限时该项记为 failed。
- **低质标记**：仅在确认页展示提示，不做自动处理。

## 待验证项

- Eagle 应用运行与关闭两种状态下，外部写入（updateItem）后 Eagle 自身能否正确感知改动——待用户实测。
