# 开发者快速上手指南

本文面向第一次接手本项目的开发人员，说明项目如何运行、双端如何共用代码，以及常见需求应修改哪些文件。

## 1. 项目概览

本项目是美师优课第三方客户端，同时支持：

- Windows：Electron 主进程 + 原生 IPC + Web 页面。
- Android：原生 WebView 外壳 + Java API 桥接 + 同一套 Web 页面。

`renderer/` 是两端共用的界面和大部分业务逻辑。桌面端和 Android 端各自实现网络请求、登录信息保存、文件上传及原生材料查看能力。响应式 CSS 只决定界面布局，运行时 API 按设备/容器类型选择，不能按屏幕宽度判断接口。

## 2. 开始之前

建议在 Windows 上使用以下环境

- Node.js 20 LTS
- npm：使用仓库中的 `package-lock.json`。
- JDK 17：仅在构建 Android 时需要。
- Android SDK Platform 36 / Build Tools 36.0.0：本地构建 APK 时需要。

## 3. 五分钟启动

在项目根目录执行：

```powershell
npm ci
npm run dev
```

`.npmrc` 中的 Electron 镜像配置可能在新版 npm 中产生 `Unknown project config` 警告，这个警告本身不等于构建失败。如果提示 Electron 安装不完整，先切换到 Node.js 20，再重新执行 `npm ci`

Windows 打包：

```powershell
npm run dist:win -- --publish never
```

产物位于 `dist/`。

Android 检查和调试 APK 构建：

```powershell
.\android\gradlew.bat -p android :app:lintDebug :app:assembleDebug --stacktrace
```

APK 位于 `android/app/build/outputs/apk/debug/`。Gradle 的 `syncWebAssets` 会在构建前自动把 `renderer/` 和 `pics/` 复制进 APK，不要手工维护另一份网页代码。

## 4. 目录结构

| 路径 | 作用 |
| --- | --- |
| `main/main.js` | Electron 入口，创建窗口、恢复会话、注册 IPC。 |
| `main/apiClient.js` | Windows 端接口签名、业务 API、OSS 上传等核心实现。 |
| `main/apiIpc.js` | Electron IPC 路由、参数边界和调试权限保护。 |
| `main/store.js` | Electron 用户数据目录中的会话和设置存储。 |
| `preload/preload.js` | 通过 `contextBridge` 向页面暴露受限 API。 |
| `renderer/common/` | 平台选择、主题、响应式样式、Android 桥和页面跳转。 |
| `renderer/main/` | 四个一级页面的横向容器和固定底栏。 |
| `renderer/home/` | 首页。 |
| `renderer/homework/` | 作业列表、科目/类型/状态筛选。 |
| `renderer/score/` | 成绩趋势、作业成绩和考试成绩。 |
| `renderer/me/` | “我的”页面。 |
| `renderer/doHomework/` | 答题、保存、回读、上传和提交。 |
| `renderer/homeworkDetail/` | 阅读作业及题干/答案材料查看。 |
| `renderer/login/` | 登录、记住用户名/密码和自定义 MAC。 |
| `renderer/settings/`、`renderer/about/` | 设置与关于页面。 |
| `android/app/src/main/java/com/youngsix/msyk/` | Android WebView 外壳、Java API、加密登录存储及材料查看器。 |
| `android/app/build.gradle` | Android 版本、SDK、Java 版本和网页资源同步。 |
| `.github/workflows/windows-build.yml` | Windows EXE、Android APK、Artifact 和 Release 工作流。 |
| `ChangeLog.md` | 对外版本变更记录。 |

## 5. 页面和导航

`renderer/main/index.html` 同时承载 `home`、`homework`、`score`、`me` 四个一级页面。它们作为 iframe 并排存在，`renderer/main/main.js` 负责横向切换、底栏高亮和一级页面 API 代理，切换时不会销毁整页状态。

修改一级页面时重点检查：

1. 页面 iframe 和底栏入口：`renderer/main/index.html`。
2. `pages` 顺序、加载和 API 白名单：`renderer/main/main.js`。
3. 页面顺序和跨页消息：`renderer/common/page-transition.js`。
4. 页宽、轨道宽度和移动端布局：`renderer/main/main.css` 及公共响应式样式。

一级页面跳转使用 `PrimaryPageTransition.navigate(...)`；从一级页面打开答题、详情、设置等独立页面，使用 `PrimaryPageTransition.open(...)`。不要依赖 `history.back()` 返回业务入口，否则材料翻页或中间跳转会把用户带回错误页面。

## 6. 新增或修改接口

页面业务统一调用 `window.msykAPI.method(payload)`，不要在页面里直接访问 Node.js、Java 对象或手写 HTTP 请求。

新增一个双端接口通常要依次修改：

1. `main/apiClient.js`：实现 Windows 端请求和响应归一化。
2. `main/apiIpc.js`：注册 IPC handler，并校验敏感或调试功能权限。
3. `preload/preload.js`：向渲染层暴露 Promise 接口。
4. `MsykApiClient.java`：实现 Android 端对应请求并加入消息分发。
5. `renderer/common/native-android.js`：添加同名 JavaScript 包装。
6. `renderer/main/main.js`：如果一级 iframe 页面会调用它，还要加入 `allowedApiMethods`。

两端必须保持相同的方法名、参数结构和返回结构。只改 preload 或只改 Java 会造成某一端静默不可用；遗漏一级页白名单时会返回“该页面无权调用此 API”。

修改前应同时对照现有调用和原版行为。后端已有拼写错误的字段名要按实际接口保留，不能为了美观自行重命名请求参数。

## 7. 常见修改入口

| 需求 | 优先查看 |
| --- | --- |
| 作业筛选后列表消失 | `renderer/homework/homework.js`、`main/apiClient.js`、`MsykApiClient.java` |
| 作业类型或状态映射 | 内部作业文档、`renderer/homework/`、两端 API 实现 |
| 答案保存/再次进入回读 | `renderer/doHomework/doHomework.js` 和保存、状态、答题卡接口 |
| 主观题图片/音频上传 | `doHomework.js`、`apiClient.js`、`apiIpc.js`、`native-android.js`、`MsykApiClient.java` |
| PPT、图片、PDF、答题卡材料 | `homeworkDetail/`、`doHomework/`、Android `DocumentViewerActivity.java` |
| 成绩页面 | `renderer/score/` 及两端 `score*` API |
| 主题和主题色 | `renderer/common/theme.js`、`theme.css`、各页面 CSS |
| 手机/平板横竖屏 | `responsive.css`、页面 CSS、Android 原生 Viewer；不要用分辨率切换 API |
| 登录和记住密码 | `renderer/login/`、`main/apiIpc.js`、Android `SecureLoginStore.java` |
| 检查更新和外部链接 | `renderer/about/`、`openExternal` 的双端桥接 |

记住密码必须使用 Electron `safeStorage` 或 Android 安全存储；用户名和自定义 MAC 可以随登录配置保存，但密码不得以明文写入 `store.json`、`localStorage` 或日志。


## 8. UI 修改约定

- 新页面引入公共 `theme.js`/`theme.css` 和响应式样式，避免硬编码成仅浅色可用。
- 手机、平板和桌面共用业务 DOM，优先用媒体查询调整布局，不复制整套页面。
- 顶部区域考虑 Android 状态栏安全距离；底部操作区考虑手势导航安全距离。
- 图片使用 `object-fit: contain` 并保留缩放能力；PDF 和网页材料需要验证 Android 原生查看路径。
- 独立页的返回目标应是明确的一级业务页，而不是浏览器历史中的上一条记录。
- 新增一级页 API 前先确认壳层白名单；新增原生能力时同时验证 Electron 的降级路径。

## 9. 版本和发布

`package.json` 的 `version` 是唯一版本来源：GitHub Actions 会检查 `package-lock.json` 根包版本必须与之相同，Android 也会从它生成 `versionName` 和 `versionCode`。不要单独修改 Android 版本号。

升级版本可执行：

```powershell
npm version 1.4.0 --no-git-tag-version
```

随后更新 `ChangeLog.md`，检查 `package.json` 与 `package-lock.json` 的版本差异，再提交。GitHub Actions 的 `Build Windows EXE and Android APK` 支持手动构建 Artifact，也可选择创建对应的 `v<version>` Release；已有版本默认不会被覆盖。

## 10. 提交前检查

```
git status --short
git diff --check
node --check main/main.js
node --check main/apiClient.js
node --check main/apiIpc.js
node --check preload/preload.js
```

提交前再确认没有加入 `node_modules/`、`dist/`、Android 构建目录、密钥、明文密码、会话签名、真实账号数据

## 11. 常见故障

- **Electron failed to install correctly**：确认 Node.js 20，重新执行 `npm ci`，并检查镜像网络是否可用。
- **打包后 preload 找不到**：确认 `package.json` 的 `build.files` 仍包含 `preload/**/*`，窗口 preload 路径仍从 `main/` 指向根目录 `preload/preload.js`。
- **一级页面 API 桌面端存在但页面报不可用**：检查 `renderer/main/main.js` 的 API 白名单。
- **桌面正常、Android 无响应**：检查 Java 消息分发、`native-android.js` 同名包装，以及 APK 是否重新执行了 `syncWebAssets`。
- **选择筛选项后数据为空**：先比对后端要求的科目、作业类型和状态实际值，不要把界面显示文本直接当作接口值。

