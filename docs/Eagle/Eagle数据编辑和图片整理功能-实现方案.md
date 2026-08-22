# Eagle 数据编辑和图片整理功能 — 实现方案

> 需求来源：`docs/Eagle/Eagle数据编辑和图片整理功能.txt`（以需求原文为准，本文档为实现方案）
> 模块说明：`src/client/pages/module/Eagle/README.md`
>
> **给后续对话的指引**：新开对话实现后续阶段前，先依次阅读 AGENTS.md → 需求原文 → 本文档 → Eagle README.md，然后实现下一个未完成的阶段。每完成一个阶段必须执行本文档末尾的「阶段完成后的固定动作」并勾选进度。

## 需求概述

「图片整理」按钮（`Toolbar.tsx`）弹出的模态框实现为三步流程：

1. **步骤 1 分类文件夹划定**：展示有描述的文件夹（描述即分类标准，从上到下为优先级）作为可滚动的标准列表；设置处理数量（默认/上限为当前全部）；仅处理图片（gif / 视频一开始就过滤）；默认勾选图片压缩（执行时服务端压缩后上传，不落盘）。确定后创建任务，后端建立处理队列。
2. **步骤 2 执行中任务**：队列按 5 并发请求 AI 视觉能力，严格 JSON 返回；单图失败标记为 failed（仍算执行过一遍）并暂停队列派发（in-flight 请求不受影响）。状态：执行中 / 已暂停（用户暂停、服务中途关闭、出错）。全部执行过一遍后进入步骤 3。
3. **步骤 3 结果确认**：顶部待确认缩略图条 → 点击查看详情；左大图、右信息（执行状态、建议标题、文件夹调整、低质标记、失败原因）；底部操作：不处理（红）/ 重新执行 / 确认（不含标题）/ 确认。全部确认前点击「图片整理」只显示结果确认界面。

按钮徽标：队列未完成时右上角显示剩余任务数量（点击进步骤 2，不能再新建）；有待确认结果时显示小红点（点击进步骤 3）。

## 总体设计

- **单任务模型**：同一时间只存在一个整理任务。队列未完成（`running` / `paused`）不能再创建；`done` 后创建新任务时清空旧结果。
- **后端执行**：队列在服务端后台执行（5 并发），不依赖前端在线；进度经 change bus（`eagle.organize` 资源）+ SSE（`/api/storage/events?resources=eagle.organize`）通知前端重拉。
- **私有持久化**（沿用 `common/task` 的 TaskService/TaskRepository 模式）：DocumentStore 存任务本体、EntityStore 每图一个结果文件，均**不注册**到 storageRegistry，前端只能走专用 API，不能经 `/api/storage/*` 任意改写。落盘 `data/eagle/organize/`。
- **视觉调用**：新增 relay 目标 `eagle.vision`（复用 `requestRegistry.execute` 的 origin 校验 / 凭据注入 / 超时），执行器在服务端直接调用；接入点配置来自独立的 `eagle-vision` 设置。
- **库写入**：本功能新增对 Eagle 库的第二个写操作 `updateItem`（改条目 metadata.json 的 name / folders，必要时重命名 .info 内原文件，并同步 mtime.json 与内存索引）。此前模块对库唯一的写操作是文件夹编辑 `updateFolder`，README 中「零写入」的表述需同步修正。

## 数据模型（新增 `src/shared/eagle/organize.ts`）

```ts
// 任务整体阶段
export type OrganizePhase =
  | 'running'    // 队列执行中
  | 'paused'     // 已暂停（用户暂停 / 出错 / 服务重启）
  | 'confirming' // 全部执行过一遍，有待确认结果
  | 'done'       // 无待确认且无待执行

// 单图结果状态（结果实体在执行完成时才落盘，pending 仅用于「重新执行」）
export type OrganizeItemStatus =
  | 'pending'
  | 'success'           // 判定成功，待确认
  | 'failed'            // 判定失败，待确认（上游错误 / 非 JSON / 不属于任何分类）
  | 'skipped'           // 用户选择「不处理」
  | 'confirmed'         // 已确认（改文件夹；是否同时修改标题由确认操作参数决定，不区分状态）

// 分类标准快照（创建任务时固化，顺序即优先级，从上到下）
export interface OrganizeFolderStandard {
  folderId: string
  /** 展示与 AI 返回匹配用完整路径，如 "插画/风景" */
  folderPath: string
  name: string
  description: string
}

// 任务文档（data/eagle/organize/task.json 的 value，OrganizeTaskRecord）
{
  phase: OrganizePhase
  pausedReason: 'user' | 'error' | 'restart' | null
  compress: boolean
  createdAt: number
  standards: OrganizeFolderStandard[]
  itemIds: string[]      // 处理队列：按创建时排序的图片 id（懒创建结果实体的依据）
  executed: number       // 已执行完成数量（服务维护的计数）
  pendingConfirm: number // 待确认数量（success + failed）
}

export interface OrganizeItemRecord {
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

## 后端结构（新增 `src/server/module/eagle/organize/`）

```
src/server/module/eagle/
├── settings.ts          # 追加 getEagleVisionEndpoint()（镜像 vision/settings 的 getVisionEndpoint，
│                        #   用 resolveVisionApiKey(getEagleVisionSettings()) 派生 apiKey）
├── relay.ts             # 新增：注册 relay 目标 'eagle.vision'（POST /chat/completions，非流式，
│                        #   与 vision/relay.ts 同构，resolveContext 换成 eagle-vision 设置），
│                        #   在 common/relay/resources.ts 增加副作用导入
├── library.ts           # 追加 updateItem()（阶段三）；索引查询追加「仅图片过滤 + 取前 N」辅助
└── organize/
    ├── storage.ts       # OrganizeRepository：私有 DocumentStore(task.json) + EntityStore(items/<itemId>.json)，
    │                    #   落盘 data/eagle/organize/；启动恢复（running→paused/restart，running 项→pending）
    ├── service.ts       # OrganizeService：prepare/create/pause/resume/结果读写/确认动作，
    │                    #   changeBus.register('eagle.organize') 并在每次变更后 publish（执行器侧节流可后续观察）
    ├── executor.ts      # 队列执行器：5 并发池，取 pending 项执行；失败/暂停时停止派发（in-flight 不中断）；
    │                    #   全部项执行过一遍后 phase→confirming（无待确认则→done）
    └── vision.ts        # 单图判定：sharp 压缩(内存中 webp) → 组装 prompt → requestRegistry.execute('eagle.vision')
                         #   → 严格 JSON 解析(zod) + folderPath 匹配校验
```

### 视觉判定细节（vision.ts）

- **压缩常量独立定义**（与 `common/static` 的 `IMAGE_MAX_DIMENSION` / `IMAGE_COMPRESS_QUALITY` 分开，两边值可不同）：如 `EAGLE_VISION_IMAGE_MAX_DIMENSION = 2000`、`EAGLE_VISION_IMAGE_QUALITY = 85`，放在 organize 模块自己的常量文件里。
- 勾选压缩时：`sharp(原文件).resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true }).webp({ quality })` → base64 data URL，**不落盘**；未勾选时直接读原文件转 base64（注意 relay `maxBodyLength` 超限时该项记为 failed）。
- **Prompt**：system 给出分类标准（folderPath + description，按顺序声明优先级从上到下），要求仅输出 JSON `{ "title": string, "folderPath": string, "lowQuality": boolean }`，`folderPath` 必须从给定列表中选；请求体加 `response_format: { type: 'json_object' }`（接入点不支持时靠解析失败兜底为 failed）。user 消息携带图片 data URL 与简短指令。
- **判定失败的条件**（status=failed，error 记原因）：HTTP/网络错误（RelayError / 超时）、返回非 JSON、zod 校验不通过、`folderPath` 不在 standards 中（含 AI 自判不属于任何一类）。**任一失败立即暂停队列派发**。

### 库写入细节（阶段三，library.ts `updateItem`）

1. 读条目 metadata.json → patch `name`（改名时）、`folders = [目标folderId]`、`lastModified = Date.now()`、`mtime = 原文件 stat`；
2. 改名时重命名 `.info` 内原文件为 `<新name>.<ext>`（原子 move）；
3. 同步更新库根 `mtime.json` 的 `[id]` 为新 `lastModified`（保证自身增量校验与 Eagle 行为一致）；
4. 更新内存索引条目（name / fileName / folders / lastModified）并 persistCache；发布 change bus 让前端刷新列表；
5. **实测项**：Eagle 应用处于运行状态时能否正确感知外部改动（Eagle 自身监听库目录），结论记入偏差小节。

## API（`/api/eagle/organize`，在 `api/eagle.ts` 内 `.route('/organize', ...)` 挂载）

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| GET  | `/prepare?folderId&sortBy&sortOrder` | 步骤 1 数据：有描述文件夹生成的 standards 列表（原顺序）+ 当前范围内可处理图片数（已排除 gif/视频） |
| GET  | `/status` | 徽标轮询：`{ phase, remaining, pendingConfirm, pausedReason }`（remaining = total - executed） |
| POST | `/task` | 创建任务：`{ folderId: string \| null, sortBy, sortOrder, count, compress }`；队列未完时 409 |
| GET  | `/task` | 任务详情（standards + 计数） |
| POST | `/task/pause` | 用户暂停：停止派发，in-flight 继续完成 |
| POST | `/task/resume` | 恢复执行 |
| GET  | `/results?status=pending&offset&limit` | 待确认结果分页（summary：itemId/status/hasTitle 等轻字段） |
| GET  | `/results/:itemId` | 结果详情（OrganizeItemRecord） |
| POST | `/results/:itemId/retry` | 重新执行单图：status→pending、attempts+1，phase→running（仅该图入队） |
| POST | `/results/:itemId/confirm` | `{ withTitle: boolean }`：写库（移动文件夹，withTitle 决定是否同时修改标题）→ 状态一律 confirmed |
| POST | `/results/:itemId/skip` | 不处理 → skipped |

所有响应沿用 `{ success, data }` 信封；itemId 沿用 `^[A-Za-z0-9]+$` 校验，路径一律从索引取。

## 前端结构（新增 `src/client/pages/module/Eagle/Organize/`，删除旧 `OrganizeModal.tsx`）

```
Organize/
├── index.tsx        # Modal 壳：按任务 phase 路由 Step1/Step2/Step3；
│                    #   running/paused→Step2，confirming→Step3，done→Step1
├── StepClassify.tsx # 步骤1：可滚动标准列表（左名称右描述单行省略）+ 处理数量 InputNumber
│                    #   （默认=全部、max=全部）+ 压缩 Checkbox（默认勾选）+ 确定创建任务
├── StepRunning.tsx  # 步骤2：状态（执行中/已暂停+原因）+ 进度（已执行/总数、成功/失败）
│                    #   + 暂停/继续按钮 + 最近失败原因展示；全部执行完自动切 Step3
├── StepConfirm.tsx  # 步骤3：顶部横向缩略图条（点击选中跳详情）；左大图（/items/:id/file）；
│                    #   右信息面板（执行状态/建议标题/目标文件夹/低质提示/失败原因）；
│                    #   底部：不处理(danger 红)/重新执行/确认（不含标题）/确认；操作后自动选下一张
├── api.ts           # /api/eagle/organize/* 封装
└── store.ts         # zustand：启动拉 status，订阅 SSE（/api/storage/events?resources=eagle.organize）
                      #   收到变更后重拉 status / 当前步骤所需数据
```

**Toolbar 改动**：`OrganizeModal` 换成 `Organize/index.tsx`；「图片整理」按钮外包 antd `Badge`——running/paused 时 `count = remaining`、confirming 时小红点（dot 或 count = pendingConfirm）、done 时无徽标。点击行为与 Modal 初始步骤一致（队列未完 → Step2 不能新建；有待确认 → 只显示 Step3）。

## 分阶段实施

### 阶段一：任务基建 + 步骤 1（分类划定） ✅ 已完成（2026-08-22）

- [x] `src/shared/eagle/organize.ts` 数据模型
- [x] `module/eagle/organize/storage.ts`：DocumentStore + EntityStore 私有仓库、启动恢复
- [x] `module/eagle/organize/service.ts`：prepare / create / pause / resume / status / 结果读写（不含执行与确认动作）
- [x] `api/eagle.ts` 挂载 organize 子路由：`/prepare` `/status` `/task` `/task/pause` `/task/resume` `/results*`（读）
- [x] 前端 `Organize/` 目录骨架 + api.ts + store.ts（SSE 订阅 status）
- [x] `StepClassify.tsx` 步骤 1 完整 UI；`index.tsx` 按 phase 路由（Step2 已实现轻量版状态/进度/暂停继续，Step3 占位）
- [x] Toolbar 徽标（剩余数）与点击路由
- 说明：本阶段创建的任务队列不会推进（执行器在阶段二落地），徽标显示 remaining 不变属预期。

### 阶段二：队列执行 + 步骤 2（视觉判定） ✅ 已完成（2026-08-22）

- [x] `module/eagle/settings.ts` 追加 `getEagleVisionEndpoint()`
- [x] `module/eagle/relay.ts` 注册 `eagle.vision`，`common/relay/resources.ts` 汇总
- [x] `organize/vision.ts`：压缩（独立常量）/ prompt 组装 / relay 调用 / 严格 JSON + zod + folderPath 匹配校验
- [x] `organize/executor.ts`：5 并发池、失败暂停派发（in-flight 不中断）、执行完 → confirming/done、变更 publish
- [x] `StepRunning.tsx` 完整 UI（状态/进度/暂停恢复/失败提示），完成后自动切步骤 3
- [x] 徽标与点击路由在真实执行下联调（SSE 推进、暂停、重启恢复为 paused）

### 阶段三：结果确认 + 库写入（步骤 3） ✅ 已完成（2026-08-22）

- [x] `library.ts` 追加 `updateItem()`（改名 + folders + mtime.json + 索引同步），索引查询辅助「仅图片过滤取前 N」如未在阶段一完成则补（阶段一已实现 `getClassifiableItems`，无需补充）
- [x] service 追加 `confirm` / `skip` / `retry` 动作（retry 会把 phase 拉回 running）
- [x] API 追加对应 POST 路由
- [x] `StepConfirm.tsx` 完整 UI（预览条 / 大图 / 信息面板 / 四个操作按钮 / 操作后自动下一张）
- [x] 小红点徽标 + 「有待确认时点击只显示结果确认」的强制路由（阶段二已实现徽标与 phase 路由，本阶段补齐确认界面）
- [ ] 手动验证：Eagle 应用运行与关闭两种状态下写入后库表现（结论记入偏差小节）——待用户实测

## 阶段完成后的固定动作（每个阶段结束时必须执行）

1. 运行 `npx tsc --noEmit`（唯一检查命令，禁止 build / eslint）；
2. 更新 `src/client/pages/module/Eagle/README.md`：文件结构、API 表、数据流、以及「对库零写入」表述（本功能引入 `updateItem` 写操作）；
3. 更新本文档：勾选该阶段清单项，并在下方「实现偏差记录」追加小节（与方案的差异、实测结论、遗留问题）；
4. 若阶段内有用户可见行为变化，手动运行 `pnpm dev` 验证基本流程。

## 实现偏差记录

### 阶段一（2026-08-22）

1. **结果实体改为懒创建**：方案原定任务创建时把所有图片写入 EntityStore（每图一文件，全部 pending）。实现时改为任务文档（task.json）保存 `itemIds` 队列数组，单图结果实体仅在执行完成时落盘（阶段二接入执行器后生效）。原因：一次性写入上万小文件耗时数十秒，而队列推进由网络请求主导，懒创建无需付出该成本。由此 `OrganizeItemStatus` 去掉了不会持久化的 `running` 值；任务文档 `maxValueLength` 放宽到 16M（默认 256K 装不下上万条 id）。
2. **文件夹顺序**：分类标准按先序遍历（父节点在前、子节点紧随），与 Eagle 界面自上而下的展示顺序一致，即优先级从上到下。
3. **暂停/恢复的 409 语义**：状态不符时返回 `{ success: false, error }` + 409，前端经 apiRequest 抛 StorageApiError 展示中文提示（未引入新的错误类型）。
4. **任务进度计数**：`executed` / `pendingConfirm` 由服务维护在任务文档中（徽标与进度条不扫描实体目录）；阶段二执行器更新计数时需保持一致。
5. 手动验证建议：`pnpm dev` 后在 Eagle 页面打开「图片整理」→ 查看分类标准列表与处理数量 → 创建任务 → 按钮出现剩余数徽标、弹窗切到执行中界面 → 暂停/继续 → 重启后端确认任务转为「已暂停（服务重启）」。
6. **（2026-08-22 调整）去掉 `confirmedNoTitle` 状态**：按用户要求，确认操作不管是否保存标题，结果状态一律为 `confirmed`；「确认（不含标题）」按钮仅影响写库时是否修改条目标题，不再体现在状态枚举中。

### 阶段二（2026-08-22）

1. **任务文档追加 successCount / failedCount 计数**：方案数据模型只定义了 executed / pendingConfirm，但步骤 2 UI 要求展示成功 / 失败数。由执行器在每次结果落盘时与 executed 一并维护（同一 `mutateTask` 串行段内更新），旧任务文档读取时兜底为 0。
2. **任务文档读改写串行化**：新增仓库方法 `mutateTask`（内存 Promise 队列，与 ResourceLock 同思路），service 的暂停 / 恢复与执行器的计数推进 / 失败暂停全部经它落盘，避免并发读改写互相覆盖 phase（例如用户暂停被计数推进还原为 running）。仓库改为模块级单例（service 与 executor 共用同一实例，串行语义才成立）。
3. **队列恢复的定位方式**：执行器启动时 `listItems` 读取全部结果实体，跳过「已有结果且非 pending」的前缀得到派发游标。派发严格按序、失败也落盘结果实体，因此已完成项必然构成前缀；重启前 in-flight 未落盘的项会被重新执行（与方案一致）。代价是恢复时一次性读取全部结果文件（万级条目约秒级），仅在 kick 时发生一次。
4. **结果落盘异常也会暂停队列**：除判定失败外，saveItem / mutateTask 抛错（存储层故障）同样停止派发并把任务置为 paused/error，避免计数与实体脱节。
5. **kick 幂等 + 排空期间恢复**：`kick()` 在执行器运行中只清除停止标记； lanes 排空后若任务仍为 running 且有未执行项（暂停排空期间用户点了继续的场景），重新拉起队列，杜绝「任务 running 但无人执行」的悬挂状态。
6. **代码块围栏剥离**：模型无视「仅输出 JSON」要求包裹 ```json 围栏时，先剥围栏再严格解析（提高成功率），仍非法 JSON 则记 failed；content 为分段数组时拼接 text 段。
7. **变更发布未节流**：每张图完成即 publish（前端 SSE 触发重拉轻量 status）。单图耗时由视觉请求主导（秒级），万级队列的发布频率可接受，如后续观察到压力再补节流。
8. 手动验证建议：`pnpm dev` 后打开「图片整理」→ 创建小批量任务（如 5 张）→ 观察进度推进与成功 / 失败计数 → 断网或改错 API Key 后继续，确认失败项记录原因且队列转「已暂停（执行出错）」→ 恢复后继续 → 全部完成后弹窗自动切到结果确认占位页、按钮出现小红点。

### 阶段三（2026-08-22）

1. **attempts 由执行器统一推进**：方案原定 retry 时 attempts+1，但执行器在真正执行时也会从上次结果 +1，为避免双重计数改为 retry 只置 pending，计数由执行器完成（与首次执行路径完全一致）。
2. **retry 同步回补 executed**：重新执行时把任务计数 `executed` 减一、`pendingConfirm` 减一，执行器完成后各自加回，保证 `remaining = total - executed` 徽标语义在重试期间正确。同时执行器派发循环改为「跳过已有非 pending 结果的项」——「重新执行」在已完成前缀中间挖出 pending 项后，其后已完成的项不会被重复执行（原「已完成构成前缀」假设被打破）。
3. **重试失败会暂停整个任务**：重新执行的图判定失败时沿用「任一失败即暂停派发」的规则，phase → paused（error）、弹窗切回步骤 2；用户点「继续」后队列排空进入 finalize 回到 confirming。单图重试场景下多一步「继续」，属可接受的一致性代价。
4. **标题即文件名的清理与冲突处理**：AI 建议标题写入前清理 Windows 文件名非法字符、压缩空白、去首尾点号并截断到 120 字符（清理后为空则保持原名）；重命名目标已存在时文件名追加 ` (1)`、` (2)` 序号且条目名同步（Eagle 以条目名定位原文件），超过 99 个同名抛错由全局 500 处理。缩略图按 `<name>_thumbnail.<ext>` 规则跟随重命名。
5. **mtime.json 只在已存在时更新**：库根 mtime.json 缺失时（降级模式）不重建部分指纹表，避免写出只有单条目的表误导后续校验。
6. **结果详情附带条目当前名称**：`GET /organize/results/:itemId` 在 `OrganizeItemRecord` 基础上增加 `itemName`（新增共享类型 `OrganizeResultDetail`），确认页用它展示「当前标题 vs 建议标题」对比。
7. **库写入后前端刷新走新变更资源 `eagle.library`**：`updateItem` 完成后发布该资源（library.ts 模块级注册），Eagle 页面 `index.tsx` 订阅 SSE 后重拉文件夹树与当前页（store 新增 `refreshCurrentPage`，当前页被清空时回到第一页）。fs.watch 触发的增量校验因 mtime.json 已同步而为空转，不产生重复刷新。
8. **判定失败的结果不能「确认」**：failed 结果没有目标文件夹，确认页两个确认按钮禁用（信息面板有提示），仅可「重新执行」或「不处理」；后端同样以 409 拦截。
9. **确认操作对 folders 是替换语义**（与「待确认假设 2」一致）：`folders = [目标 folderId]`，图片移出原文件夹。
10. 手动验证建议：`pnpm dev` 后完成一个小批量任务 → 步骤 3 检查缩略图条 / 大图 / 信息面板 → 依次测试四个操作（确认、确认不含标题、重新执行、不处理），确认后回 Eagle 页面看图片已移入目标文件夹、标题按预期修改、文件夹计数刷新 → Eagle 应用运行与关闭两种状态下分别写入并观察 Eagle 自身是否正确感知外部改动（结论回填本节）。

### 评审修正（2026-08-22，三阶段完成后的自查）

1. **结果列表补 offset/limit + 前端按状态拉取**：方案 API 表写了分页参数但实现只支持 status 过滤，且确认页无参数全量拉取后在前端过滤（含已确认/跳过的结果）。现在 `/results` 支持 `offset`/`limit`（缺省全量，列表按 updatedAt 倒序），确认页改为分别拉 success / failed 再合并（缩略图条本身需要全部待确认项，不引入真分页）；步骤 2 的「最近失败原因」用 `limit=1` 只取最新一条。
2. **执行器收尾以实体状态为准 + finalize 权威重算计数**：原收尾按 `executed < itemIds.length` 判断是否重拉队列，若某次 `saveItem` 成功而紧随的 `mutateTask` 写盘失败（瞬时存储故障），计数与实体脱节后所有项都会被游标跳过、0 个 lane 排空，判断恒真导致 `runQueue` 无限重拉的热循环，任务永远进不了 confirming。现改为重扫结果实体判断「是否存在 pending 或未落盘项」，finalize 时以实体为准重算 executed / pendingConfirm / successCount / failedCount（复用重扫结果，不额外全量扫描）。`retryItem` 同步调整为先改任务计数再落盘 pending 结果：后半步写盘失败时 kick 经 finalize 以实体自愈回 confirming，不会卡死在 running。
3. **确认前校验目标文件夹仍存在**：分类标准是任务创建时的快照，长任务期间文件夹可能被删除。`confirmItem` 在写库前经 `folderExists`（library.ts 新增，按 id 递归查找，改名不影响）校验目标文件夹当前仍在库中，已删除则返回 409 提示重新执行。

## 待确认假设（实现时如与预期不符，在偏差记录中说明）

1. 「当前全部」= 当前选中文件夹（未选 = 全库）内、按当前排序的图片集合；gif / 视频排除；不排除已归类的图片。
2. 确认「调整文件夹」= 将图片 `folders` **替换**为 `[目标文件夹]`（移出原文件夹），而非追加。
3. 低质标记仅在确认页展示提示，不做自动处理。
4. 重新执行仅对单图重新判定，不影响其他已确认结果。
