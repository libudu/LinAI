# LinAI

个人 AI 工具箱桌面 Web 应用：React 前端 + Hono 后端的全栈 TypeScript 项目，最终打包成内置 Node.js 运行时的 Windows 免安装压缩包分发。主要功能模块：GPT 图像生成（经云雾 yunwu.ai 中转）、语音合成（Inworld / Gemini TTS，含 Ren'Py 台词同步）、图片整理（media-classifier）、聊天代理。

## 开发约定（必须遵守）

- 所有安装依赖使用 pnpm
- 不要运行 build 命令
- 仅在所有代码编写完成的最后运行类型检查，仅使用 `npx tsc --noEmit`，不要用 eslint、不要用 build 命令

## 技术栈

- 前端：React 19 + Vite 8 + react-router-dom 7 + antd 6（zhCN locale）+ Tailwind CSS 4（@tailwindcss/vite）+ zustand + ahooks + sass
- 后端：Hono 4 + @hono/node-server + zod（@hono/zod-validator）
- AI 服务：`@google/genai`（Gemini）、`openai` SDK 对接云雾（yunwu.ai）
- 其他：sharp（缩略图）、playwright、jszip、fs-extra、wav、animejs
- 工具链：tsx（运行/监视 TS）、tsup（服务端打包）、prettier、husky

## 常用命令

- `pnpm dev`：同时启动前端（vite，端口 5174，`/api` 代理到 3000）和后端（tsx watch，开发端口 3001）
- `npx tsc --noEmit`：类型检查（改代码后唯一需要运行的检查命令）
- `pnpm prettier`：格式化 `src/**/*.{js,jsx,ts,tsx,css,scss,md}`
- `pnpm start`：以生产模式从源码运行服务端（NODE_ENV=production，端口 3000）
- 构建发布（AI 代理不要运行）：`pnpm build:private` / `pnpm build:public`（`*SkipTag` 变体跳过 git tag）

## 目录结构

- `src/client/`：前端
  - `pages/module/`：功能页面（GeminiTTS、MediaClassifier、YunwuAdmin 云雾用户管理，仅管理员可见）
  - `pages/common/`：通用页面组件（Sidebar、GenImage 图片生成首页，含其下的 TaskList、TemplateSection、SettingModal，及 Notification）
  - `routes.tsx`：路由注册表，新增页面在此登记
  - `store/global.ts`：zustand 全局状态；`hooks/`、`common/`、`utils/`
- `src/server/`：后端
  - `index.ts`：Hono 入口，所有 API 路由在此挂载（`/api/*`），导出 `AppType` 供前端 RPC 类型推导
  - `api/`：HTTP 接口层（chat、gpt-image、tts、tts-inworld、media-classifier、style-analyze、yunwu-token，及 `api/common/` 下的 task/template/log/static/config）
  - `module/`：业务逻辑层（gpt-image、tts、media-classifier、chat、utils/logger）
  - `common/`：基础设施（config 配置读写、static 静态文件、task-manager 任务管理、template-manager 模板管理）
  - `migrate.ts`：版本迁移脚本，供最终用户拖入新版压缩包升级
- `data/`：运行时数据（不入库的用户数据），含 `config.json`（API 密钥）、`tasks.json`、`templates.json`、`images/`、`tts/`、`logs/`、`media-classifier/`；服务以 `process.cwd()/data` 定位
- `data-template/`：发布时打包进 `dist/data` 的初始数据
- `dist-template/`：发布模板，含便携 Node 运行时（`runtime/node.exe`）和 `双击运行.bat`、`版本迁移….bat`
- `scripts/post-build.ts`：构建后处理（git tag 检查、复制模板、dist 内安装生产依赖、打 zip）；`scripts/renpy_dialogue/` 为 Ren'Py 台词提取的辅助脚本

## 构建与发布流程

`vite build`（前端 → `dist/client`）→ `tsup`（服务端打包为 CJS → `dist/server`，playwright / sharp 保持 external，并自动生成 `dist/package.json`）→ `scripts/post-build.ts`（要求工作区干净并打 `v<版本号>` tag；复制 dist-template 与 data-template；在 dist 内 `pnpm install --prod`；产出 `LinAI v<版本>-private|public.zip`）。最终用户解压后用 `双击运行.bat` 启动（生产模式服务端直接托管 `dist/client` 静态文件并自动打开浏览器）。`.env.public` 在 public 构建模式下注入 `VITE_IS_PUBLIC=true`。

## 代码风格

- Prettier：2 空格缩进、无分号、单引号、尾随逗号、LF 换行；插件自动整理 import 顺序和 Tailwind class 排序
- tsconfig：strict + noUnusedLocals + noUnusedParameters，`moduleResolution: bundler`，允许 `.ts` 扩展名导入
- 项目注释与日志输出主要使用中文，沿用这一习惯

## 测试

项目没有测试套件（`pnpm test` 是占位符直接报错）。验证方式 = `npx tsc --noEmit` 类型检查 + 手动运行验证。

## 安全注意事项

- `data/config.json` 保存用户的 API 密钥（GPT 图像密钥经 `src/server/module/gpt-image/encrypt.ts` 加密存储），不得提交或泄露；仓库内该文件属于本地运行数据
- `.husky/pre-commit` 会拒绝 git `user.name` 含汉字的提交（避免真名泄露），提交前确保用户名不含中文
