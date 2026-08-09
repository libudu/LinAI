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
- `src/server/`：后端
  - `index.ts`：Hono 入口，所有 API 路由在此挂载（`/api/*`），导出 `AppType` 供前端 RPC 类型推导
  - `api/`：HTTP 接口层，每个业务模块一个文件或同名文件夹；`api/common/` 为通用接口（task/template/log/static/config）
  - `module/`：业务逻辑层；`common/`：基础设施（config-json、static、task-manager、template-manager）
  - `migrate.ts`：版本迁移脚本，供最终用户拖入新版压缩包升级
- `data/`：运行时数据（不入库的用户数据），服务以 `process.cwd()/data` 定位
- `data-template/`、`dist-template/`：发布模板（后者含便携 Node 运行时与启动/迁移 bat）
- `scripts/post-build.ts`：构建后处理（git tag、复制模板、dist 内安装生产依赖、打 zip）

## 模块与配置的实现方式

每个业务模块的配置遵循同一套三层结构（参考 gpt-image / tts / novel）：

1. **配置存储**：`src/server/module/<模块>/config.ts`，用 `common/config/config-json.ts` 的 `ConfigJson` 类创建实例（自动建目录、合并默认值、落盘），独立存储在模块自己的数据目录下（如 `data/images/config.json`、`data/tts/config.json`），导出 `getXxxConfig` / `updateXxxConfig` 及按业务需要的使用方辅助函数（如 `getYunwuApiKey`）
2. **接口层**：在模块的 api 文件中暴露 `/config` GET/POST（如 `/api/gptImage/config`，zod 校验 + `updateXxxConfig`），通用 `api/common/config.ts` 只保留真正全局的项（目前仅 localNetworkUrl）
3. **前端状态**：模块自己的 zustand store（如 `GenImage/store.ts`、`Novel/SettingModal/useNovelConfig.ts`），setter 调 `/config` POST 并用服务端返回的完整配置覆盖本地状态；启动时统一 `fetchConfig` 拉取一次

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

- 各模块 `data/` 下的 config.json 保存用户的 API 密钥（GPT 图像密钥经 `src/server/module/gpt-image/encrypt.ts` 加密存储），不得提交或泄露；仓库内 `data/` 下文件属于本地运行数据
- `.husky/pre-commit` 会拒绝 git `user.name` 含汉字的提交（避免真名泄露），提交前确保用户名不含中文
