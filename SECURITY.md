# 安全策略

## 支持的版本

当前维护 1.0.x 版本。

## 报告安全问题

请优先使用 GitHub 仓库的 **Private vulnerability reporting**（Security → Report a vulnerability）私下报告，不要直接开公开 issue。

报告中请不要附带：

- `%APPDATA%\onebridge\rclone.conf`
- `%APPDATA%\onebridge\config.json`
- 任何 `access_token`、`refresh_token`、`client_secret`
- 包含个人路径或文件名的完整日志

如果必须提供日志，请先删除其中的本地路径、账户邮箱和令牌字段。

## 凭证如何存储

OneBridge 使用 rclone 的 OAuth 流程登录 OneDrive。令牌保存在本机：

```text
%APPDATA%\onebridge\rclone.conf
```

该文件等同于账户访问权限，不会上传到本项目。请不要把它提交到 Git、网盘、issue 或聊天记录中。若怀疑泄露，请立即在 Microsoft 账户中撤销对应授权并重新登录。

## 镜像模式提醒

镜像同步会删除目标端多余文件。对重要目录请先用「仅上传」或「仅下载」验证路径，再切换镜像模式。
