# OneBridge

现代化的 Windows OneDrive 同步与传输客户端。基于 Electron、React 与 rclone 构建，中文界面、任务分组、定时镜像同步、大文件分块传输与暂停/继续，以及传输完成后的自动电源操作。

OneDrive客户端的问题：

- 需要将不同位置的文件移动或复制到OneDrive目录下才能同步，相当于有在电脑上临时复制了一份

- OneDrive客户端同步时会大量占用cpu造成卡顿

因此诞生了OneBridge

> 当前版本针对**个人 Microsoft 账户**的 OneDrive 优化，仅提供 Windows x64 构建。

<img width="2161" height="1368" alt="image" src="https://github.com/user-attachments/assets/46f3342e-ef58-4cbc-bf85-e0325427b31a" />
<img width="1266" height="1215" alt="image" src="https://github.com/user-attachments/assets/245bfe5f-fac4-4619-ab3c-8ef1c564b0b8" />


## 功能特性

### 同步与传输
- **四种同步模式**：上传镜像、下载镜像、仅上传、仅下载。
  - 镜像模式会让目标端与源端完全一致，包括删除目标端多余文件。
  - 仅上传 / 仅下载只新增或更新文件，不删除已有内容。
- **任意位置直接传输**：可从任意本地磁盘、移动硬盘或网络位置选择文件/文件夹直接传到 OneDrive，无需先复制到本地缓存目录。
- **目标文件夹即时创建**：在选择 OneDrive 目标目录时可直接新建并命名文件夹，创建成功后自动进入，无需先到文件管理页创建。
- **任务分组**：用「工作」「照片」「备份」等分组整理任务，支持筛选、重命名、删除与颜色标识。
- **定时同步**：默认每 30 分钟运行一次，可按任务设置分钟、小时或天级间隔，也可设为仅手动运行。
- **多来源并行任务**：一个任务可包含多个「本地路径 → OneDrive 路径」配对，也可只同步单个文件。多个配对有上限地并行传输，单个大文件不会排在其他来源的成千上万个小文件之后；并行数不会超过「设置 → 性能」中的全局并发预算（最多 6 个来源同时进行）。
- **传输后操作**：任务成功后可选择关闭显示器、锁定屏幕、睡眠、休眠或关机；关机前有 60 秒可取消倒计时。
- **暂停与继续**：传输队列和任务卡片均可随时暂停/继续。暂停会挂起当前任务的所有 rclone 进程（包括并行传输的多个来源），继续后从当前字节接着传输，单个大文件也不会重新开始；排队中的任务同样支持暂停。
  - 暂停只在本次运行中有效。完全退出应用、进程崩溃或被强制结束后，未完成的传输会重新开始；rclone 不会跨进程保留 OneDrive 上传会话，下载留下的 `.partial` 临时文件也会被重新下载覆盖。
- **自动重试**：大文件按块上传、多线程传输；网络波动时会按任务设置自动重试。
- **不限速默认**：默认不设置带宽上限，充分利用可用带宽；需要时可配置全局限速。

### 文件管理
- 浏览 OneDrive 文件夹，支持列表/网格视图、搜索、面包屑导航和刷新。
- 上传文件或整个文件夹，保留目录结构。
- 下载文件或文件夹到指定本地位置。
- 新建文件夹、重命名、删除、批量选择与批量删除；选择同步目标时也可直接新建文件夹并进入。
- 获取 OneDrive 分享链接。
- 文本和图片在线预览；其他文件可下载后调用系统默认程序打开。

### 体验与可靠性
- 实时传输进度、速度、剩余时间与文件计数。
- 运行中或排队中的传输均可暂停/继续，暂停时进度、速度与剩余时间会冻结。
- 传输队列与历史记录，包含失败原因、耗时、删除数量和触发方式。
- 系统托盘常驻、开机自启、关闭到托盘、完成/失败通知。
- 深色、浅色与跟随系统三种主题。
- rclone 引擎状态检测，可自动下载或手动指定 `rclone.exe`。
- 配置导出/导入，可选是否包含账户凭证。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面框架 | Electron 45 |
| 界面 | React 19、TypeScript、Tailwind CSS 4、Zustand、lucide-react、sonner |
| 构建 | electron-vite 6、Vite 8、electron-builder 26 |
| 同步引擎 | 内置 rclone 1.75.2（Windows x64） |
| 数据存储 | JSON 配置 + rclone 配置文件 |

主进程负责窗口、托盘、调度、任务执行、rclone 子进程、日志和电源操作；渲染进程通过 contextBridge 暴露的受限 IPC API 与主进程通信，不启用 Node 集成。

## 环境要求

- Windows 10 / 11 x64
- Node.js 20 或更高版本
- npm 10 或更高版本
- 可访问 Microsoft 登录页与 OneDrive 的网络环境
- 个人 Microsoft 账户

## 快速开始

### 1. 安装依赖

```powershell
npm install
```

`postinstall` 会自动下载 rclone 到 `resources/bin/rclone.exe`。如果下载失败，可重试：

```powershell
npm run setup:rclone
```

国内网络可先设置镜像：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm install
```

### 2. 启动开发版

```powershell
npm run dev
```

### 3. 登录 OneDrive

1. 打开「设置 → OneDrive 账户」。
2. 点击「登录 OneDrive」。
3. OneBridge 会启动 `rclone authorize onedrive` 并自动打开浏览器。
4. 在浏览器中登录 Microsoft 账户并同意授权。
5. 授权完成后返回 OneBridge，应用会自动保存凭证并读取账户信息与空间配额。

凭证保存在本机 rclone 配置中，OneBridge 不会将账户密码或令牌上传到任何自有服务器。

### 4. 创建同步任务

1. 打开「同步任务 → 新建任务」。
2. 填写任务名称并选择分组。
3. 选择同步模式。
4. 添加一个或多个来源：本地文件/文件夹与对应的 OneDrive 路径。
5. 设置运行间隔、排除规则、校验方式和是否删除目标端多余文件。
6. 按需配置传输完成后的电源操作，保存任务。

任务可直接点击「同步」手动运行，也会在启用后按间隔自动运行。

## 数据与配置

应用数据默认位于 Electron 的用户数据目录，可在「设置 → 配置与数据 → 打开数据目录」直接打开。典型内容如下：

| 文件/目录 | 说明 |
| --- | --- |
| `config.json` | 应用设置、账户信息、分组、任务与历史记录 |
| `rclone.conf` | OneDrive 远程配置与 OAuth 凭证 |
| `logs/main.log` | 主进程日志 |
| `logs/jobs/*.log` | 每个同步任务的 rclone 输出日志 |
| `preview/` | 文件预览临时文件 |

开发模式和安装版的数据目录均为 `%APPDATA%\onebridge`。可在「设置 → 配置与数据 → 打开数据目录」确认实际路径。

### 导出与导入

- 「设置 → 配置与数据」可将设置、分组、任务和历史导出为 JSON。
- 默认导出**不包含**凭证，适合迁移任务配置。
- 勾选「包含账户凭证」后，导出的 JSON 会包含 rclone OAuth 令牌，可在新机器上直接恢复登录状态。
- 导入前会校验并清洗配置，缺失分组的任务会自动变为未分组；无凭证导入时保留当前账户。

> **安全提示：** 包含凭证的导出文件等同于账户访问权限。请只保存在可信位置，不要上传到网盘、代码仓库或发送给他人；使用完毕后建议删除。若文件泄露，请立即在 Microsoft 账户中撤销对应授权并重新登录。

## 构建与打包

```powershell
# 类型检查
npm run typecheck

# 仅构建未打包产物（out/）
npm run build

# 构建 Windows x64 解包目录（release/win-unpacked/）
npm run pack:win

# 构建 NSIS 安装包（release/OneBridge-1.0.2-Setup.exe）
npm run build:win
```

如需修改传输暂停组件，可重新编译 `resources/bin/transfer-control.exe`：

```powershell
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /optimize+ /target:exe /out:resources\bin\transfer-control.exe scripts\transfer-control.cs
```

安装包使用 NSIS，支持选择安装目录、创建桌面快捷方式，卸载时默认保留用户数据。

## 本地演示模式

没有 OneDrive 账户时，可使用内置演示数据浏览界面：

```powershell
node scripts\seed-demo.mjs
$env:ONEBRIDGE_USER_DATA=(Resolve-Path test-user-data).Path
$env:ONEBRIDGE_ROUTE='dashboard'
npm run dev
```

演示数据使用一个 `alias` 类型的 rclone 远程，把 `onedrive:` 映射到项目内的 `demo-cloud/` 文件夹，可用于测试上传、下载、镜像与预览，不会访问真实 OneDrive。

## 项目结构

```text
src/
  main/          Electron 主进程：窗口、IPC、配置、rclone、任务、调度、电源
  preload/       安全的 contextBridge API
  renderer/      React 界面（页面、组件、状态管理、样式）
  shared/        共享类型与常量
resources/
  bin/           内置 rclone.exe 与传输暂停控制组件
  tray.png       托盘图标
build/           安装包图标与构建资源
scripts/         演示数据、rclone 下载、图标生成与暂停组件构建脚本
```

## 已知限制

- 仅支持 Windows；电源操作依赖 Windows 命令。
- 主要针对个人 Microsoft 账户测试；商业账户会按 Microsoft Graph 返回的驱动器类型自动配置，但尚未完整验证。
- 预览大型文件或非文本/图片格式时，会先下载到临时目录再交给系统打开。
- OneDrive 登录授权必须在浏览器中完成，无法离线验证。
- 导入/导出使用系统原生文件对话框。
- 传输暂停/继续依赖 Windows 进程挂起，只在本次应用运行期间有效；退出应用或进程崩溃后不会保留传输进度。
- 暂停时间过长可能导致 OneDrive 上传会话过期，继续时 rclone 会重试，必要时重新开始该文件；正常时长的暂停会从当前字节继续。

## 常见问题

**rclone 未安装或路径无效？**

在「设置 → 同步引擎」自动下载引擎；也可以下载 rclone 后通过「选择 rclone.exe」手动指定，路径会在重启后保留。

**任务开关关闭时显示「已暂停」？**

任务开关关闭时不会自动运行，但仍可手动点击「同步」。开启开关后，调度器会根据下次运行时间自动触发。这与传输队列中的「已暂停」不同：后者表示正在运行或排队中的传输被手动暂停。

**传输中点「暂停」会从头开始吗？**

不会。暂停会挂起当前的 rclone 进程，继续后从当前字节接着传输，单个大文件也适用；排队中的任务会先移出队列，继续时重新加入。暂停只在本次应用运行期间有效：完全退出应用、崩溃或强制结束进程后，上传会重新开始，未完成的下载也会重新下载。

**下载中断后 `.partial` 文件能续传吗？**

不能跨进程续传。rclone 在下载中断后会保留 `.partial` 临时文件，但重新运行任务时会将其截断并从头下载；应用内的「暂停/继续」则不会中断进程，可以接着当前进度传输。

**镜像任务会删除文件吗？**

会。镜像模式以源端为准，目标端多余文件会被删除。重要目录建议先使用「仅上传」或「仅下载」验证路径，再切换镜像模式。

**为什么默认不限速？**

rclone 默认不会限速。OneBridge 也默认留空全局带宽限制，以最大化吞吐；如影响其他网络活动，可在「设置 → 性能」中填写如 `10M` 的限制。

## 更新记录

### 1.0.2

- 多来源任务改为有上限的并行执行：最多 6 个来源同时传输，并共享「设置 → 性能」中的全局并发预算，避免大文件排在大量小文件之后。
- 为复制/镜像任务增加 `--no-update-dir-modtime`，减少 OneDrive 上每个目录一次额外的时间戳 PATCH 请求。
- 暂停、继续和取消现在会同时作用于任务内所有并行 rclone 进程；取消产生的上下文错误不再计入失败摘要。
- 传输页与任务卡片会显示「并行 N 个来源 · 已处理 X/Y」。

## 许可

项目采用 MIT License。
