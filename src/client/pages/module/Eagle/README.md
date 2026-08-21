# Eagle 图片管理模块

只读浏览 Eagle 资源库（`.library` 目录）中的图片 / gif / 视频：左侧文件夹目录树，右侧网格资源列表，支持排序、刷新、大图预览与视频播放。**模块对库目录零写入**，所有自身数据（配置、索引缓存、缩略图回退缓存）落在 `data/eagle/` 下。

> 需求与方案文档：`docs/Eagle图片管理模块.txt`、`docs/Eagle图片管理模块-实现方案.md`、`docs/Eagle资源库.txt`（库结构说明）。修改本模块后请同步更新本文档。

## 文件结构

```
src/shared/eagle/types.ts                # 前后端共享类型（EagleFolder / EagleItem / 排序类型）

src/server/module/eagle/
├── settings.ts                          # 注册式设置：libraryPath，落盘 data/eagle/config.json
└── library.ts                           # 核心：内存索引（扫描/增量校验/fs.watch/查询）

src/server/api/eagle.ts                  # Hono 子路由，挂在 /api/eagle

src/client/pages/module/Eagle/           # 本目录
├── index.tsx                            # 页面入口：左右分栏布局 + 未配置引导页
├── api.ts                               # /api/eagle/* fetch 封装 + 文件 URL 辅助
├── store.ts                             # zustand：文件夹树/列表/排序/分批加载
├── FolderTree.tsx                       # 左侧 antd Tree（默认全展开，节点带图片数）
├── ResourceGrid.tsx                     # 右侧网格 + 无限滚动 + 图片预览 + 视频 Modal
├── Toolbar.tsx                          # 排序 Select + 刷新按钮 + 总数
└── SettingModal/
    ├── index.tsx                        # 库路径配置弹窗（openEagleSettingModal）
    └── useEagleConfig.ts                # 配置 zustand store（/api/settings/eagle）
```

注册点：

- 路由/侧栏：`src/client/routes.tsx` 中 `path: '/eagle'` 一项（侧栏自动出现，设置按钮挂 `onClickSetting`）
- 后端路由：`src/server/index.ts` 链式 `.route('/api/eagle', eagleApi)`
- 设置汇总：`src/server/common/settings/resources.ts` 副作用导入 `module/eagle/settings`

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

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/folders` | 文件夹树，`count` 直接包含数 / `totalCount` 含子孙累计 |
| GET | `/items?folderId&sortBy&sortOrder&offset&limit` | 服务端排序分页；`sortBy=mtime\|size`，`limit` 上限 500；缺省 folderId = 全部 |
| POST | `/refresh` | 触发增量校验（库路径变化时重建索引） |
| GET | `/items/:id/thumbnail` | 优先库内 `_thumbnail.png` → 缺失时图片用 sharp 生成 200px webp 缓存到 `data/eagle/thumb/` → 视频回退占位 SVG |
| GET | `/items/:id/file` | 原文件流式返回，支持 Range（206），视频可拖进度条 |

约定：

- 条目 id 校验 `^[A-Za-z0-9]+$`，文件路径一律从索引查出，不拼接用户输入
- 文件/缩略图响应以 `lastModified` 为 ETag（`must-revalidate`），库内容变更后浏览器缓存自动失效
- 信封结构 `{ success, data }` 与其他模块一致；前端经 `apiRequest`（`client/service/storage.ts`）解析

## 前端数据流

1. `index.tsx` 挂载 → `fetchEagleConfig()` → 有 `libraryPath` 才 `store.init()`，否则显示「去配置」引导
2. `store.init()` 并行拉 `/folders` + 第一页 `/items`（每批 100）
3. 切换文件夹 / 排序 → 清空列表重拉第一页；排序偏好持久化在 localStorage `eagle_sort`
4. `ResourceGrid` 底部哨兵（IntersectionObserver，提前 400px）触发 `loadMore()` 追加批次
5. 预览：图片进 `Image.PreviewGroup`（items 只含非视频）；视频点击开 Modal 内 `<video>`（依赖 file 接口的 Range 支持）
6. 设置弹窗保存库路径后调用 `store.reload()`（= POST /refresh + 重拉数据）

## 样式约定

- 网格格子：`aspect-square` + `object-cover` + `loading="lazy"`，参考 `GalleryImageGrid`
- 页面高度：主容器无固定高度，页面根用 `h-[calc(100dvh-1.5rem)] sm:h-[calc(100dvh-3rem)]`（扣除 main 垂直内边距），左右栏内部滚动
- 暗色：沿用 `dark:` 前缀类（`html[data-theme='dark']` 映射）

## 修改指南

- **加列表字段**：改 `src/shared/eagle/types.ts` 的 `EagleItem` + `library.ts` 的 `toEagleItem`；若需持久化到索引缓存，同步改 `EagleItemIndex` 和 `buildIndexEntry`（旧缓存缺字段时要有默认值兜底，或考虑清缓存逻辑）
- **加排序维度**：扩展 `EagleSortBy` + `getItems` 排序逻辑 + `Toolbar` 选项（注意 localStorage 里旧值要能正常解析）
- **加 API**：`api/eagle.ts` 内新增，保持信封结构和 id 校验；前端在 `api.ts` 加封装
- **不要**引入对库目录的写操作；不要复用 `common/static` 的 `serveImage`（整读 Buffer 不支持 Range）
- 改完跑 `npx tsc --noEmit`，然后更新本文档
