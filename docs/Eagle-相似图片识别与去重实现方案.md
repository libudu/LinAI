# Eagle 模块「相似图片识别与去重」实现方案

> **状态**：方案设计完成，待实施  
> **核心选型**：`sharp` + `sharp-phash`（感知哈希初筛） + `pixelmatch`（空间微观差异复核）  
> **核心原则**：
> 1. **相似度数据保留前端 + 动态阈值调节**：后端宽松初筛后将量化相似度数据全量保留给前端，前端提供实时滑块供用户自由调节展示阈值，由用户直观判断什么样的相似程度最合适；
> 2. **所有修改操作必须由前端用户手动确认**：严禁任何后台静默或自动化删改，所有移入回收站、移动分类等写操作均需用户显式勾选并经过弹窗二次确认。

---

## 1. 现状、痛点与设计原则

### 1.1 现状与局限
- 当前 LinAI Eagle 模块仅支持基于文件的只读浏览、按文件夹归类、以及调用大模型视觉 API 进行自动打标分类。
- 现有去重方式仅能依赖全量文件名或外部工具，对于以下情况完全无能为力：
  1. **同图不同哈希**：同一张图片经由不同平台下载、格式转换（PNG/WebP/JPG）、或重新压缩后，MD5/SHA256 完全不同，导致重复占用磁盘空间；
  2. **边角水印干扰**：图片内容完全一致，仅右下角多了一个平台的半透明小水印或角标；
  3. **微小差分变体**：二次元角色表情差分、漫画微小分镜裁剪、Live2D 连续微动图。这类图片**不是无用垃圾**，用户往往希望将其**聚类归组**而非简单粗暴地当成重复项删除。

### 1.2 核心设计原则
1. **用户掌握最终裁决权（User in Control）**：
   - 算法不替用户做主，只负责提供详实的量化参考（如综合相似度 98%、差异面积 1.2%、水印检出标识、红框差异位置）。
   - **全流程手动确认**：任何涉及磁盘文件变动（移入 Eagle 回收站、移动文件夹、改名）必须由用户在前端界面勾选并经过二次确认弹窗，绝不执行后台静默删除。
   - **安全软删除优先**：默认仅对接 Eagle 回收站软删除（`DELETE /items/:id`，保持文件完整可恢复），严禁默认物理硬删除。
2. **前端动态阈值响应，免重复扫描**：
   - 后端采用相对宽松的基准底线（如综合相似度 $\ge 75\%$）进行初筛和精检，将所有候选数据及详细指标一次性返回前端缓存。
   - 前端提供**实时相似度滑块**，用户拖动滑块即可瞬间调整页面展示的严格程度（$75\% \sim 99\%$ 自由滑动），无需重新耗时扫描全库。
3. **轻量与高性能**：
   - 纯本地运行，不调用云端视觉 API，不引入重型深度学习模型；
   - 底层复用已有的 `sharp`（libvips C 引擎）和纯 JS 的 `pixelmatch`，零额外 C++ 编译风险，完全适配 Windows 绿色便携包。

---

## 2. 技术选型与依赖规划

| 组件 / 功能 | 选型方案 | 引入方式 | 选型理由 |
| :--- | :--- | :--- | :--- |
| **图像解码与缩放** | `sharp` (已在依赖中) | 现有依赖（tsup external） | 高性能 libvips C 引擎，处理超大图与并发极快，内存占用极低。 |
| **宏观感知哈希** | `sharp-phash` (或基于 sharp 的纯 JS DCT pHash) | `pnpm add sharp-phash` | 生成 64 位 DCT 感知指纹，天然具备抗微小水印和重压缩能力，无额外 C++ 编译负担。 |
| **微观差异定位** | `pixelmatch` | `pnpm add pixelmatch` | 纯 JS、零原生依赖、工业级前端视觉回归标准，毫秒级比对像素并输出差异像素点分布与边界框。 |
| **并查集聚类** | 内部实现 `DisjointSet` (Union-Find) | 零依赖（约 40 行纯 TS） | 将两两相似对快速合并为图片相似分组（Clusters）。 |

---

## 3. 核心算法流程与漏斗型计算管道

```
[ 全库图片 (N 张) ]
       │
       ▼ (阶段 1：增量提取指纹，持久化缓存)
[ 双轨指纹库 (全局 pHash + 裁切 Crop-pHash + 宽高比) ]
       │
       ▼ (阶段 2：宽松汉明距离粗筛 + 并查集聚类)
[ 候选相似对 (基准相似度 >= 75%) ]
       │
       ▼ (阶段 3：Sharp 内存对齐 + pixelmatch 微观差异定位)
[ 精细评分与定性分类 (计算相似度得分、差异像素比、差异框) ]
       │
       ▼ (阶段 4：全量候选数据下发前端持久缓存)
[ 前端动态筛选与人工确认 ]
  ├── ① 实时滑块调节展示阈值 (75% ~ 99% 即时无感重滤)
  ├── ② 红框高亮差异区域 (直观呈现右下角水印或表情微差)
  ├── ③ 用户手动勾选处置项 (推荐选中，允许自由调整)
  └── ④ 强制弹窗二次确认 -> 调用后端接口安全软删除/移动
```

### 阶段 1：双轨感知指纹提取与增量持久化
每张图片提取 3 项基础特征：
1. **`aspectRatio`（宽高比）**：保留两位小数（$w / h$）。宽高比差异 $> 6\%$ 的图片对直接剪枝跳过。
2. **`globalHash`（全局 64-bit pHash）**：
   - 图像经 sharp 缩放到 $32 \times 32$ 灰度图；
   - 进行 2D 离散余弦变换 (DCT)；
   - 截取左上角 $8 \times 8$ 低频系数矩阵，与中位数比对生成 64 位指纹。
3. **`cropHash`（去边缘 64-bit pHash）**：
   - 使用 sharp 将图片四周向内各裁切 $10\%$（剔除最容易出现水印的四角和边框）；
   - 对中心 $80\% \times 80\%$ 区域独立计算一份 64 位 pHash。

> **增量原则**：计算结果存入 `data/eagle/similarity/fingerprints.json`。对比 `mtime.json`，未变动的图片直接读缓存（1.7 万条目仅需数十毫秒），仅对新增或更新的图片触发计算。

### 阶段 2：宽松汉明粗筛与并查集聚类
为了让前端能有充裕的数据供用户拖动滑块筛选，后端采用**宽松初筛**：
- 计算两个 64 位指纹的汉明距离：
  - `distGlobal = hammingDistance(a.globalHash, b.globalHash)`
  - `distCrop = hammingDistance(a.cropHash, b.cropHash)`
- **初筛门槛**（较宽容，避免漏掉潜在相似）：
  - 若 `distGlobal <= 8` 或 `distCrop <= 5` $\to$ 纳入可疑对；
- 使用并查集（Union-Find）将成对的相似图片收敛为互不相交的**相似分组（Similarity Group）**。

### 阶段 3：像素级微观复核与多维度评分
对候选图片对进行精细复核与评分：
1. **尺寸归一化**：使用 `sharp` 在内存中将两张图临时缩放到统一标准尺寸（$256 \times 256$ RGBA Buffer）；
2. **像素比对**：调用 `pixelmatch` 进行比对，得到：
   - `diffPixelCount`（不同像素数）；
   - `diffRatio`（差异像素占比 = $diffPixelCount / (256 \times 256)$）；
   - `diffBoundingBox`（所有差异像素的外接矩形 $[minX, minY, maxX, maxY]$，归一化为 0~1 的比例）。
3. **综合相似度计算公式（`similarityScore`，0 ~ 100%）**：
   - 结合像素一致率与感知距离：  
     $\text{pixelScore} = (1 - \text{diffRatio}) \times 100\%$  
     $\text{hashScore} = (1 - \min(distGlobal, distCrop) / 64) \times 100\%$  
     $\text{similarityScore} = \text{round}(0.7 \times \text{pixelScore} + 0.3 \times \text{hashScore}, 1)$
4. **定性分类判定规则**：
   - **完全重复（`exact_duplicate`）**：
     - `similarityScore >= 98%` 且 `diffRatio < 0.008`；
     - 判定原因：重压缩、格式转换或肉眼无法察觉的微差。
   - **水印副本（`watermark_replica`）**：
     - `similarityScore >= 88%`，差异像素占比 $< 5\%$；
     - 且 `diffBoundingBox` 落在**右下角区域**（$minX \ge 0.65$ 且 $minY \ge 0.70$）或四周 $8\%$ 边框内；
     - 判定原因：纯水印/角标干扰，主体高度吻合。
   - **微小差分变体（`variant_split`）**：
     - `similarityScore` 在 $75\% \sim 95\%$ 之间；
     - 差异区域分布在画面中偏主体核心区域（如面部、肢体、分镜）；
     - 判定原因：差分立绘、连续分镜、同构变体。

### 阶段 4：主图智能推荐（供用户参考，不自动处置）
在同一个相似组内，系统自动根据客观质量指标标记一张**系统推荐保留图（Primary Item）**：
1. **水印优先级**：无水印项 > 带水印项；
2. **分辨率优先级**：总像素数（$Width \times Height$）更高的一方优先；
3. **文件体积优先级**：无损/高质量大文件优先；
4. **修改时间优先级**：创建/入库较早的原件优先。

---

## 4. 数据结构设计（`src/shared/eagle/similarity.ts`）

```ts
/** 相似类型判定 */
export type SimilarityKind =
  | 'exact_duplicate' // 完全相同（仅编码/体积/分辨率不同）
  | 'watermark_replica' // 带水印副本（仅边角有微小水印/角标）
  | 'variant_split' // 微小差分变体（主体有细微改动/表情差分）

/** 差异外接矩形（归一化比例 0 ~ 1） */
export interface DiffBoundingBox {
  x: number // 起始 X (0~1)
  y: number // 起始 Y (0~1)
  width: number // 宽度比例 (0~1)
  height: number // 高度比例 (0~1)
}

/** 缓存中的图片指纹结构 */
export interface EagleFingerprint {
  id: string
  mtime: number
  aspectRatio: number // 宽 / 高，保留 2 位小数
  globalHash: string // 64位十六进制字符串
  cropHash: string // 去掉10%四周边缘后的64位指纹
}

/** 单个相似项描述（携带完备相似度与量化特征） */
export interface SimilarityItemDetail {
  id: string
  name: string
  ext: string
  size: number
  width: number
  height: number
  mtime: number
  thumbnailUrl: string
  isPrimary: boolean // 是否是系统推荐的保留项
  kind: SimilarityKind | 'primary'
  similarityScore: number // 综合相似度评分（0 ~ 100，保留1位小数，如 96.5）
  hammingDistance: number // 最小汉明距离 (0~64)
  diffRatio?: number // 与主图的差异像素占比 (e.g. 0.018 = 1.8%)
  diffBox?: DiffBoundingBox // 差异发生的位置框
  resolutionDesc: string // e.g. "1920x1080 (高清)"
}

/** 相似分组 */
export interface SimilarityGroup {
  groupId: string
  kind: SimilarityKind // 本组主要相似性质
  maxSimilarityScore: number // 组内最高相似度得分
  primaryId: string // 系统推荐保留的条目 ID
  items: SimilarityItemDetail[]
}

/** 扫描任务状态 */
export interface SimilarityScanStatus {
  phase: 'idle' | 'fingerprinting' | 'comparing' | 'ready' | 'error'
  totalItems: number
  processedFingerprints: number
  comparedPairs: number
  foundGroups: number
  errorMessage?: string
}

/** 前端筛选器参数（前端纯内存即时过滤，无需重新发请求） */
export interface SimilarityClientFilter {
  thresholdScore: number // 用户滑块设置的最低相似度阈值 (75 ~ 99，默认 85)
  selectedKinds: SimilarityKind[] // 用户勾选的类型过滤（全部 / 水印副本 / 差分）
  onlyWithPrimary: boolean // 仅显示有推荐主图的分组
}
```

---

## 5. 服务端架构与 API 设计

### 5.1 服务端模块划分（`src/server/module/eagle/similarity/`）
```
src/server/module/eagle/similarity/
├── fingerprint.ts       # 依托 sharp 计算 globalHash / cropHash 与宽高比
├── storage.ts           # 指纹缓存 (data/eagle/similarity/fingerprints.json) 与全量分组结果持久化
├── comparator.ts        # 汉明距离粗筛 + 并查集聚类
├── pixel-verifier.ts    # 内存 256x256 对齐 + pixelmatch 细查 + 边角水印/差分分类器 + 相似度评分计算
├── service.ts           # 任务调度单例（进度推送、增量更新、中止支持）
└── index.ts             # 统一导出
```

### 5.2 API 路由定义（挂载在 `/api/eagle/similarity/*`）

| 方法 | 路由 | 说明 |
| :--- | :--- | :--- |
| `POST` | `/api/eagle/similarity/scan` | 触发全库或指定文件夹扫描（采用后端基准宽松阈值，获取全量相似池） |
| `GET` | `/api/eagle/similarity/status` | 获取当前扫描进度（轮询或配合 SSE） |
| `POST` | `/api/eagle/similarity/stop` | 中止正在进行的扫描任务 |
| `GET` | `/api/eagle/similarity/groups` | 获取全量相似分组数据（包含各图片的详细 `similarityScore` 与 `diffBox`） |
| `POST` | `/api/eagle/similarity/resolve` | **用户显式手动确认后的批量操作**：<br>`{ actions: [{ groupId, keepId, trashIds: [], targetFolderId? }] }` |
| `POST` | `/api/eagle/similarity/ignore-group` | 用户手动标记忽略特定分组（不再提示） |

---

## 6. 前端 UI 与交互方案（LinAI Eagle 页面）

### 6.1 入口与弹窗形态
- 在 Eagle 页面顶部工具栏 `Toolbar.tsx` 中增设「相似排查」按钮；
- 显示检出结果徽标（如 `[🔍 相似排查 (发现 24 组)]`）；
- 点击打开全屏「相似图片整理」模态框（类似现有的图片整理 Modal，左/顶分栏，视野开阔）。

### 6.2 核心控件一：动态相似度滑块（实时本地重滤）
在弹窗顶部提供显眼的交互控制区：
1. **相似度阈值滑块（Slider）**：
   - 调节范围：`75% ~ 99%`，默认值建议 `85%`；
   - 步长：`1%`；
   - **动态无感响应**：用户拖拽滑块时，前端基于 store 中已保留的各条目 `similarityScore` 实时计算过滤，**毫秒级更新**下方卡片列表；
   - **即时反馈**：滑块旁显示当前匹配统计，如：`当前阈值 ≥ 85%：匹配 18 组（共 42 张图片）`；拖动到 `95%` 时即时变为 `当前阈值 ≥ 95%：匹配 7 组（共 15 张图片）`；
   - **让用户自主调优**：用户可以拖高滑块快速清理板上钉钉的重复项，也可以拉低滑块寻找潜在微小差分变体。
2. **分类过滤器（Tab / Tag Filter）**：
   - 标签选项：`全部` / `仅带水印副本` / `微小差分` / `完全相同`；
   - 支持与滑块组合过滤。

### 6.3 核心控件二：分组对比卡片与差异定位高亮
1. **分组卡片布局**：
   - 横向并排：左侧为主图（带醒目绿色「★ 推荐保留」标签与勾选框），右侧平铺展示同组的各张相似图；
   - 每张图片卡片头部醒目标注：
     - **相似度得分**：如 `相似度 98.2%`（根据分值高低显示绿/蓝/黄不同颜色徽章）；
     - **定性标签**：如 `[右下角水印 +1.5%]`、`[主体微差 +6.2%]`；
     - **规格参数对比**：清晰并排标出两者的分辨率、格式和文件大小，劣势项红色标注，优势项绿色标注。
2. **差异区域红框高亮（可视化找茬）**：
   - 当用户鼠标悬停在副本卡片、或点击卡片上的「差异定位」按钮时：
   - 图片预览层直接根据 `diffBox` 坐标比例，**绘制一个带呼吸动效的红色半透明发光框**；
   - 用户一眼就能看出水印所在具体位置，或差分图片究竟微变了哪一处细节，无需来回切换肉眼找茬。

### 6.4 核心原则三：所有修改必须用户手动确认（二次确认流程）
1. **默认建议选中，用户可自由改选**：
   - 初始进入时，系统**仅在界面勾选框（Checkbox）上给出一个推荐选择**（主图默认保留，水印副本默认建议勾选删除/移走）；
   - 用户可以随意点击勾选框切换选择，也可以点击“全选建议项”或“全部取消”。
2. **不可绕过的二次确认弹窗（Confirmation Modal）**：
   - 用户在勾选若干项后，点击底部「移入回收站」或「批量移动」按钮；
   - 系统**强制弹出一个专门的二次确认对话框**：
     - 明确列出受影响的图片数量（如：“即将把 12 张图片移至 Eagle 回收站”）；
     - 以网格缩略图列表罗列**所有即将被变动的图片缩略图及原文件名**；
     - 说明安全保障：“文件仅移入回收站，原文件依然保留在磁盘，可在 Eagle 回收站随时撤销与恢复”；
     - 用户必须**显式点击红色的「确认移入回收站」按钮**，才会真正向后端发送处置指令；点击「取消」则放弃操作。

---

## 7. 性能优化与容错保障

### 7.1 内存与 CPU 控制
- **指纹计算流水线**：单张图生成 pHash 时直接在 sharp 管道中缩小到 32x32，不产生大型中间对象；
- **并发控制**：指纹计算限制并发度为 `os.cpus().length - 1`（默认 4~8 并发），避免桌面客户端卡死；
- **二级复核按需加载**：`pixelmatch` 只对初筛入选的少数候选对执行，每次对比仅分配 256x256 临时 Buffer，对比完毕即触发垃圾回收。

### 7.2 针对 Windows 绿色包的打包安全性
- 严禁引入需要 `node-gyp`、Python 或额外 C++ Runtime 的感知哈希包（如 `node-phash` 等古旧原生库）；
- 核心图形变换完全由项目中已经稳定工作的 `sharp` 原生引擎驱动，其余对比逻辑均为纯 JavaScript/TypeScript，确保 `pnpm build:private` 与 Windows `.bat` 绿色解压即用。

---

## 8. 实施计划路线图

- [ ] **阶段 1：底层库集成与指纹流水线**
  - 安装并验证 `sharp-phash` 与 `pixelmatch`；
  - 编写 `fingerprint.ts`，支持全局 pHash 与去边缘 Crop-pHash；
  - 实现本地指纹缓存存储与 `mtime` 增量刷新机制。
- [ ] **阶段 2：比对与评分引擎实现**
  - 编写汉明距离初筛与并查集分组；
  - 实现基于 256x256 归一化的 `pixel-verifier.ts`，完成综合相似度得分（`similarityScore`）、水印外接矩形与微小差分分类器；
  - 输出包含全量量化指标的数据结构。
- [ ] **阶段 3：服务端 API 与状态流转**
  - 实现 `/api/eagle/similarity/*` 路由体系；
  - 严格确保后端写接口必须接收前端显式指定的 ID 列表，无任何隐式删除。
- [ ] **阶段 4：前端交互与动态滑块 UI**
  - 构建全屏「相似图片整理」模态框；
  - **实现前端动态相似度滑块（Slider）与即时重滤响应逻辑**；
  - 实现图片差异区域红框高亮功能；
  - **实现用户手动勾选交互与严谨的二次确认弹窗（Confirm Modal）**。
- [ ] **阶段 5：大图库压测与准确率调优**
  - 针对真实上万张图的 Eagle 资源库测试扫描耗时与内存表现；
  - 验证动态滑块在数百组相似图片时的流畅度。
