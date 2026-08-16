# LinAI

个人 AI 工具箱桌面 Web 应用：React 前端 + Hono 后端的全栈 TypeScript 项目，最终打包成内置 Node.js 运行时的 Windows 免安装压缩包分发。主要功能模块：GPT 图像生成、语音合成（TTS）、图片整理（media-classifier）、小说生成（流式）、聊天代理。

## 开发约定（必须遵守）

- 所有安装依赖使用 pnpm
- 不要运行 build 命令
- 仅在所有代码编写完成的最后运行类型检查，仅使用 `npx tsc --noEmit`，不要用 eslint、不要用 build 命令

## 技术栈

- 前端：React 19 + Vite + react-router-dom + antd 6（zhCN）+ Tailwind CSS 4 + zustand + ahooks + sass
- 后端：Hono 4 + @hono/node-server + zod（@hono/zod-validator）
- 工具链：tsx（运行/监视 TS）、tsup（服务端打包）、prettier、husky

## 常用命令

- `pnpm dev`：同时启动前端（vite，端口 5174，`/api` 代理到 3000）和后端（tsx watch，开发端口 3001）
- `npx tsc --noEmit`：类型检查（改代码后唯一需要运行的检查命令）
- `pnpm prettier`：格式化 `src/**/*.{js,jsx,ts,tsx,css,scss,md}`
- 构建发布（AI 代理不要运行）：`pnpm build:private` / `pnpm build:public`（`*SkipTag` 变体跳过 git tag）

## 目录结构

- `src/client/`：前端
  - `pages/module/`：功能页面（GeminiTTS、MediaClassifier、Novel、YunwuAdmin 等）
  - `pages/common/`：通用页面组件（Sidebar、GenImage 图片生成首页、Notification）
  - `routes.tsx`：路由注册表，新增页面在此登记
  - `store/global.ts`：zustand 全局状态（仅跨模块共享的少量状态）
  - `theme.tsx`：全局明暗主题 + 自定义强调色（`AppThemeProvider` / `useAppTheme`），localStorage 键 `app_theme` / `app_theme_accent`；暗色样式靠 `index.css` 中 `html[data-theme='dark']` 属性选择器映射 Tailwind 亮色类；独立 createRoot 的弹窗需自行包一层 `AppThemeProvider`
- `src/server/`：后端
  - `index.ts`：Hono 入口，所有 API 路由在此挂载（`/api/*`），导出 `AppType` 供前端 RPC 类型推导
  - `api/`：HTTP 接口层，每个业务模块一个文件或同名文件夹；`api/common/` 为通用接口（task/storage/settings/relay/log/static/config）
  - `module/`：业务逻辑层；`common/`：基础设施（storage、settings、relay、static、task）
  - `common/storage/`：可靠存储基础层（原子 JSON 读写、`.bak`/`.corrupt` 备份恢复、资源级串行队列、CollectionStore / EntityStore / DocumentStore、StorageRegistry、StorageError 统一错误、`dataPath()`、change-bus 变更总线），写盘失败抛错由全局 `app.onError` 映射为 404/409/413/500；资源在 `common/storage/resources.ts` 注册后，前端经 `/api/storage/collections|entities/:resource` 访问（信封结构见 `src/shared/storage/types.ts`，客户端封装在 `client/service/storage.ts`）；EntityStore 每实体一个 `<id>.json`、列表只返回 summary，小说（`data/novels/books/`）与 TTS 项目（`data/tts/projects/`）已迁入，业务修改全部在前端读改写整体保存；资源变更经 `/api/storage/events?resources=...` 订阅（SSE 只发资源 ID + 版本信息，前端收到后重新拉取）
  - `common/settings/`：注册式设置（SettingsRegistry），通用路由 `GET/PUT /api/settings/:id`，详见下文"模块与配置的实现方式"
  - `common/relay/`：受限请求中继（RequestRegistry：origin/方法/路径白名单 + 服务端凭据注入 + SSE 透传），通用路由 `POST /api/relay/:target`，目标在 `common/relay/resources.ts` 注册（当前为 novel.openai、inworld）；带文件副作用或业务预处理的请求保留专用适配器，不开放任意 URL 代理
  - `common/task/`：生成任务（TaskRepository 私有复用 CollectionStore 持久化 `data/tasks.json`，不注册到通用存储；TaskService 负责状态流转、输出文件清理、启动恢复，变更发布到 change bus 的 `image.tasks`）
  - `migrate.ts`：版本迁移脚本，供最终用户拖入新版压缩包升级
- `src/shared/`：前后端共享的类型与常量（无 UI、无 Node 依赖），如 `gpt-image/endpoints.ts`（接入点预设）、`image/template.ts`（模板业务类型）、`storage/types.ts`（通用存储信封）、`novel/types.ts`（小说数据类型）、`tts/project.ts` + `tts/inworld.ts`（TTS 项目与音色类型）
- `data/`：运行时数据（不入库的用户数据），服务以 `process.cwd()/data` 定位
- `data-template/`、`dist-template/`：发布模板（后者含便携 Node 运行时与启动/迁移 bat）
- `scripts/post-build.ts`：构建后处理（git tag、复制模板、dist 内安装生产依赖、打 zip）

## 模块与配置的实现方式

后端会消费的模块配置（API Key、Base URL、模型 ID 等）统一走注册式 SettingsRegistry（参考 gpt-image / tts / novel）：

1. **注册定义**：`src/server/module/<模块>/settings.ts`，调用 `settingsRegistry.register()` 声明 zod schema（字段唯一定义来源）、defaults 与旧格式迁移，落盘在模块自己的数据目录（如 `data/images/config.json`，自动迁移为 DocumentStore 信封结构）；导出异步的服务端内部辅助函数（如 `getYunwuApiKey`）。注册汇总在 `common/settings/resources.ts`
2. **接口层**：通用路由 `GET/PUT /api/settings/:id`（`api/common/settings.ts`），各模块不再实现自己的 `/config` 路由；本应用前后端均在用户本地，密钥明文回传，方便用户查看与复制
3. **前端状态**：模块自己的 zustand store（如 `GenImage/store.ts`、`Novel/SettingModal/useNovelConfig.ts`），经 `client/service/settings.ts` 的 `settingsClient` 整体读写（带 revision 冲突检测），启动时统一拉取一次；`gptImageApiKey` 按当前接入点从 keychain 派生（`resolveGptImageApiKey`），用于"是否已配置"判断与表单回填

纯前端拥有的业务数据（模板、小说、TTS 项目）不走 SettingsRegistry，走通用存储 `/api/storage/*`（见上目录结构）。真正全局的项仍在 `api/common/config.ts`（目前仅 localNetworkUrl）

## 构建与发布流程

`vite build`（前端 → `dist/client`）→ `tsup`（服务端 → `dist/server`，playwright / sharp 保持 external）→ `scripts/post-build.ts`（产出 `LinAI v<版本>-private|public.zip`）。最终用户解压后用 `双击运行.bat` 启动，服务端直接托管 `dist/client` 并自动打开浏览器。`.env.public` 在 public 构建下注入 `VITE_IS_PUBLIC=true`。

## 代码风格

- Prettier：2 空格缩进、无分号、单引号、尾随逗号、LF 换行；插件自动整理 import 顺序和 Tailwind class 排序
- tsconfig：strict + noUnusedLocals + noUnusedParameters，`moduleResolution: bundler`，允许 `.ts` 扩展名导入
- 路径别名：`@/*` → `src/*`；跨 client/server 或向上超过 3 级的引用用 `@/`，其余用相对引用（`./` / `../`）
- 项目注释与日志输出主要使用中文，沿用这一习惯

## 测试

项目没有测试套件。验证方式 = `npx tsc --noEmit` 类型检查 + 手动运行验证。

## 安全注意事项

- 各模块 `data/` 下的 config.json 保存用户的 API 密钥，经 `/api/settings/:id` 明文读写（本地应用，方便用户查看复制），不得提交或泄露；`src/server/module/gpt-image/encrypt.ts` 仅服务于 YunwuAdmin 的"API Key 加密转换"工具与存量 `la-` 前缀密钥的解密；仓库内 `data/` 下文件属于本地运行数据
- `.husky/pre-commit` 会拒绝 git `user.name` 含汉字的提交（避免真名泄露），提交前确保用户名不含中文
