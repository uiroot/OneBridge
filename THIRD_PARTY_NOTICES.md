# 第三方组件说明

OneBridge 使用或分发以下第三方组件。各组件的版权归其作者所有，并遵循各自许可证。

| 组件 | 用途 | 许可证 | 项目地址 |
| --- | --- | --- | --- |
| rclone | OneDrive 同步引擎（安装包内置，源码构建时自动下载） | MIT | https://github.com/rclone/rclone |
| Electron | 桌面运行时 | MIT | https://github.com/electron/electron |
| React / React DOM | 界面 | MIT | https://github.com/facebook/react |
| electron-vite / Vite | 构建 | MIT | https://github.com/alex8088/electron-vite |
| Tailwind CSS | 样式 | MIT | https://github.com/tailwindlabs/tailwindcss |
| lucide-react | 图标 | ISC | https://github.com/lucide-icons/lucide |
| adm-zip | 解压 rclone 安装包 | MIT | https://github.com/cthackers/adm-zip |
| Zustand | 状态管理 | MIT | https://github.com/pmndrs/zustand |
| sonner | 通知组件 | MIT | https://github.com/emilkowalski/sonner |

## 分发二进制时

如果你在 GitHub Releases 或其他渠道分发 OneBridge 安装包，请同时保留 rclone 的版权与许可证声明。安装包内已包含：

```text
resources/licenses/OneBridge-LICENSE.txt
resources/licenses/THIRD_PARTY_NOTICES.md
resources/licenses/rclone-COPYING.txt
```

rclone 的许可证文本也可从 https://github.com/rclone/rclone/blob/master/COPYING 获取。

Electron 的许可证文本会随安装包一起放在 `LICENSE.electron.txt` 和 `LICENSES.chromium.html` 中。
