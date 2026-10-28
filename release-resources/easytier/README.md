# EasyTier 对应源码发布输入

当前修正版使用 `EasyTier-2.7.0-linai-gateway1.6487a5e-source.zip`，
校验值和大小见 `dist-template/runtime/easytier/manifest.json` 的 `correspondingSource`。

固定上游提交及依赖保持一致，更新了编译说明及脚本，增加启动 TCP 端口转发所需的
`socks5` feature，并修正原生 host 的 `proxy_enabled` 能力判定，让 `smoltcp` 构建启动
已有的入站 TCP 代理；不启用 KCP、QUIC、原始 ICMP 或 SOCKS 监听。
旧版归档已从当前版本移除，对应源码仍可从 Git 历史获取。

此目录不复制进 dist。发布脚本读取 runtime 清单中的对应源码信息并校验，
源码归档仅保留在项目目录，不复制到仓库根目录，不写入主包，也不作为 Release 附件上传。
核心版本、固定提交和构建参数见 `../../dist-template/runtime/easytier/manifest.json`
及 `SOURCES.md`。更新运行资源说明时必须同步对应 `files` 哈希。

private/public 复用同一份项目源码。请将本目录归档纳入版本控制，确保干净检出可构建。
Release 只上传主包，发布说明链接到同一 tag 下的本目录源码文件。分发时需维护接收者
可免费访问的源码及获取指引；仅在发布者本地保留不等于接收者可以获取。
