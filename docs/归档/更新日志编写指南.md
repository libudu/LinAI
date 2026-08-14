# 更新日志编写指南

需要补充应用内更新日志时，按以下步骤操作。

## 目标文件

`src/client/pages/common/Notification/UpgradeContent.tsx` 中的 `upgradeHistory` 数组，一条模板字符串对应一个版本，**最新版本排在最前面**。

## 数据来源

1. `git tag --sort=-creatordate` 查看已有版本 tag。
2. `git log v<旧版本>..v<新版本> --oneline --no-merges` 查看每个版本区间的提交记录。
3. 最新 tag 到 HEAD 之间（`git log v<最新tag>..HEAD --oneline --no-merges`）尚未打 tag 的提交，作为下一个版本号的更新日志内容。
4. 对语义不明的提交，用 `git show <hash> --stat` 确认改动范围，必要时用 Grep 核实功能最终状态，避免把后来又被移除的功能写进日志。

## 文案风格

- 标题行：`LinAI v<版本号> 更新内容 🐱：`
- 正文每条一行，emoji 开头 + 简短描述，每版 3~5 条，聚焦用户可感知的功能变化，忽略纯重构/格式化/文档类提交。
- 参考已有条目的 emoji 用法：✨ 新功能、🖼️ 图片相关、🔧 修复优化、🗑️ 清理删除、🔐 安全、📱 移动端、🐛 bug 修复等。
- 如果某功能在后续版本被移除或改换入口，在新版本条目中注明替代关系，但**不要修改历史版本的日志原文**。
