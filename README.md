# Markdown Viewer

> 专注阅读体验的 Windows 本地 Markdown / 文本 / 代码阅读器。
> A local, keyboard-friendly Markdown and code viewer for Windows.

[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D6?style=flat-square)](#)
[![Electron](https://img.shields.io/badge/Electron-45-2B2E3A?style=flat-square)](https://www.electronjs.org/)
[![License](https://img.shields.io/badge/license-MIT-2E7D32?style=flat-square)](LICENSE)

Markdown Viewer 是一个本地优先的桌面阅读器：没有账号、没有云端、没有遥测。打开文件或文件夹即可阅读 Markdown、纯文本和常见代码文件，也可以直接编辑保存，还能新建和编辑 Excalidraw 画板。界面为阅读而设计，支持完整 Markdown 渲染、多标签、文件树、全文搜索和 Windows 文件关联。

![Markdown 阅读界面](docs/screenshots/reading-image.png)

## 功能

- **专注阅读**：窄内容栏、可调正文宽度与行距、九档主题（基础三色 + GitHub / VS Code / One Dark），滚动时大纲同步高亮。
- **完整 Markdown**：GFM 表格与任务列表、KaTeX 数学公式、Mermaid 时序图/流程图、代码高亮、目录锚点、相对链接跳转，以及经过净化的原生 HTML。
- **本地图片**：支持相对路径、绝对路径、`https` 与 `data:` URI；中文目录、空格文件名均可解析；点击图片可弹层查看，支持缩放、旋转、翻转、拖拽，以及上一张/下一张切换。
- **多文档工作区**：多根文件树、标签页、会话恢复、最近打开，支持拖拽、命令行参数和第二次启动继续打开文件。
- **阅读与编辑**：Markdown 可在预览与源码之间切换；文本和代码文件使用 CodeMirror 6 高亮编辑。阅读模式下可直接点选任务列表复选框，勾选与取消会改写源码对应行并标记为未保存，`Ctrl+S` 落盘。保存前检测外部修改，冲突时给出横幅选择。
- **Excalidraw 画板**：`.excalidraw` 与 Markdown 一样可直接新建、打开、绘制并 `Ctrl+S` 保存，`Ctrl+E` 在只读画布与完整编辑器之间切换，外部修改与保存冲突沿用同一套检测。Markdown 中用 `![](./x.excalidraw)` 或 `![[x.excalidraw]]` 嵌入画板，渲染为静态 SVG，点击即在标签页打开源文件；画板在标签页中保存后嵌入会自动刷新，未被打开的画板只在主题切换或所在 Markdown 重新加载时刷新。字体随包分发，绘图与导出全程离线；画布内的撤销、复制等操作沿用 Excalidraw 自身快捷键（先点击画布获得焦点）。
- **查找**：Markdown 预览内查找、编辑器内查找；文件树同时支持文件名与文件内容搜索。
- **文件管理**：新建文件/文件夹（可在设置中选择默认格式），在资源管理器中定位、删除到回收站、右键菜单操作；文件、文件夹与根目录都可重命名（右键或 `F2`），改名后已打开的标签页会迁移到新路径并保留未保存的内容；可以把不关心的文件或文件夹从文件树隐藏，在父级节点右键选择具体项目恢复，或到设置中管理隐藏列表。
- **大文件优化**：按字符数自动切换精简模式，避免超大文件在后台被完整解析，10 MB 级纯文本也能快速打开和平滑滚动。
- **Windows 集成**：无边框自定义标题栏，集成侧栏开关、菜单与最小化/最大化/关闭控件；注册/修复 `.md` 与 `.markdown` 文件关联，关闭窗口后驻留托盘，单实例运行。
- **本地与安全**：无账号、无遥测；启用 `contextIsolation` 与渲染进程沙箱，Markdown 中的 HTML 会被净化，外链交由系统浏览器打开。

## 截图

| 表格与公式 | 深色主题 |
|:---:|:---:|
| ![表格与公式](docs/screenshots/reading-light.png) | ![深色主题](docs/screenshots/reading-dark.png) |

| GitHub 深色 | One Dark |
|:---:|:---:|
| ![GitHub 深色](docs/screenshots/reading-github-dark.png) | ![One Dark](docs/screenshots/reading-one-dark.png) |

| 护眼米色 | 代码编辑与查找替换 |
|:---:|:---:|
| ![护眼米色](docs/screenshots/reading-sepia.png) | ![代码编辑与查找替换](docs/screenshots/editor-search.png) |

![设置抽屉中的九档主题色板](docs/screenshots/settings.png)

## 主题

九档主题加「跟随系统」，全部由 `html[data-theme]` 上的 CSS 变量驱动：正文、代码高亮、编辑器配色、Mermaid 图表与窗口底色一起切换，选择记录在设置里，下次启动保持。

| 分组 | 主题 | 底色 | 主色 |
| --- | --- | --- | --- |
| 基础 | 浅色 | `#fbfaf7` | `#3a6ea5` |
| 基础 | 深色 | `#15171b` | `#6a9ed4` |
| 基础 | 护眼米色 | `#f8f3e8` | `#8a6331` |
| GitHub | GitHub 浅色 | `#ffffff` | `#0969da` |
| GitHub | GitHub 深色 | `#0d1117` | `#58a6ff` |
| VS Code | VS Code 浅色 | `#ffffff` | `#005fb8` |
| VS Code | VS Code 深色 | `#1e1e1e` | `#3794ff` |
| 其他 | One Dark | `#282c34` | `#61afef` |

色值与明暗标记集中在 [`src/shared/themes.ts`](src/shared/themes.ts)，主窗口底色、原生深浅色（影响滚动条与表单控件）、CodeMirror 的 `dark` 标记和 Mermaid 主题都从这一份定义取值。

## 支持的格式

| 类型 | 扩展名 / 文件名 | 行为 |
| --- | --- | --- |
| Markdown | `.md` `.markdown` | 预览 + 源码编辑 |
| 画板 | `.excalidraw` | 画板阅读 + 编辑保存 |
| 文本 / 代码 | 见下方说明 | 高亮显示 + 编辑保存 |

代码与文本采用白名单识别，覆盖 JavaScript / TypeScript / JSX / TSX、JSON、HTML、CSS / SCSS / LESS、Python、Java、C / C++、C#、Go、Rust、PHP、Ruby、Perl、Lua、R、Swift、Kotlin、Scala、Dart、Objective-C、Shell、PowerShell、Batch、SQL、YAML、TOML、INI / Properties、`.env`、TeX、GraphQL、Vue / Svelte / Astro、Diff / Patch、日志、CSV / TSV、`Dockerfile`、`Makefile`、`LICENSE`、`README` 等。完整列表见 [`src/shared/fileKinds.ts`](src/shared/fileKinds.ts) 与 [`src/renderer/src/lib/codeLanguage.ts`](src/renderer/src/lib/codeLanguage.ts)。

单个文件读取与保存上限为 **30 MB**。

## 大文件处理

大文件模式使用文档的 UTF-16 字符数分级，而不是磁盘字节数，因为后者与渲染成本并不完全对应：

| 字符数 | 模式 | 行为 |
| --- | --- | --- |
| `< 2,000,000` | 普通 | 正常高亮、自动换行与 Markdown 预览 |
| `>= 2,000,000` | 精简 | 关闭语法高亮与额外编辑特性；Markdown 直接以源码打开；仍可编辑保存 |
| `>= 20,000,000` | 超大 | 默认只读，`Ctrl+E` 或状态栏按钮确认后才允许编辑 |

实现要点：

- 非 Markdown 文件、大 Markdown 源码模式不再挂载隐藏的 Markdown 预览，避免在后台完整执行 remark / rehype 解析。
- 编辑器基于 CodeMirror 6 的 rope 文档与视口渲染，DOM 只保留可见区域附近的行。
- 单行超长文本会自动关闭自动换行，避免在打开时进行代价极高的换行高度计算。
- 不做文件分段加载，保持编辑、搜索、保存与外部修改检测使用同一份文档状态。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+O` | 打开文件 |
| `Ctrl+Shift+O` | 打开文件夹 |
| `Ctrl+S` | 保存 |
| `Ctrl+E` | 切换阅读 / 编辑 |
| `Ctrl+F` | 查找（预览内或编辑器内） |
| `Ctrl+A` | 全选（阅读视图选中当前文档，编辑视图选中全部源码） |
| `Ctrl+B` | 显示 / 隐藏侧栏 |
| `Ctrl+W` | 关闭当前标签页 |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | 切换标签页 |
| `Ctrl+,` | 打开设置 |
| `F2` | 重命名文件树中选中的文件或文件夹 |
| `F5` | 重新加载当前文档 |
| `Alt+F4` | 退出应用 |
| `Esc` | 关闭设置、查找、图片弹层或对话框 |

编辑模式内还有：`Ctrl+Z` / `Ctrl+Y` 撤销与重做，`Ctrl+X` / `Ctrl+C` / `Ctrl+V` 剪切复制粘贴，`Tab` / `Shift+Tab` 增减缩进，`Ctrl+Shift+[` / `Ctrl+Shift+]` 折叠与展开当前代码块，`Ctrl+Alt+[` / `Ctrl+Alt+]` 折叠与展开全部，`Ctrl+D` 选中下一个相同文本，`Ctrl+Shift+L` 选中全部相同文本，`Ctrl+Alt+G` 跳转到行。

查找面板内用 `Enter` / `F3` 跳到下一个匹配，`Shift+Enter` / `Shift+F3` 回到上一个。图片弹层内用 `←` / `→` 切换同一文档内的图片，`+` / `-` 缩放，`0` 重置缩放与旋转。

完整清单也会显示在「帮助 → 关于」对话框中。

## 安装与使用

从 Releases 下载 Windows x64 压缩包，解压后直接运行 `md-viewer.exe`，无需安装。

也可以把文件或文件夹拖入窗口，或通过命令行打开：

```bash
md-viewer.exe "D:\notes\README.md"
md-viewer.exe "D:\notes"
```

首次使用 `.md` 文件关联时，在「设置 → 文件关联」中点击「注册关联」。Windows 10/11 不允许程序静默成为默认应用，若仍被其他编辑器接管，请在系统「默认应用」中为 `.md` 选择 Markdown Viewer，只需设置一次。

## 开发

需要 Node.js `^20.19.0` 或 `>=22.12.0`（推荐 Node 22 LTS 以上），Windows 环境。

```bash
npm install
npm run dev      # 启动开发模式
npm run build    # 类型检查并构建到 out/
npm run pack     # 构建并用 electron-builder 生成 release/win-unpacked
npm run zip      # 将 release/win-unpacked 压缩为 zip
```

`npm run build` 在 electron-vite 之后会执行 [`scripts/copy-excalidraw-assets.mjs`](scripts/copy-excalidraw-assets.mjs)，把 Excalidraw 的字体（含中文 Xiaolai 的 unicode-range 分片，约 13 MB / 234 个文件）拷到 `out/renderer/excalidraw/fonts`。这一步必须在构建之后跑，因为 renderer 的输出目录会被清空；打包后的窗口通过 `mdv://asset/` 读取这些字体，因此画板与 SVG 导出不依赖任何 CDN。压缩包体积也因此比纯文本版本大约 13 MB。

目录结构：

```text
src/
  main/       Electron 主进程：窗口、IPC、文件监听、搜索、注册表协议
  preload/    受限的 window.mdv API
  renderer/   React 界面、CodeMirror 编辑器、Markdown 渲染管线
  shared/     主进程与渲染进程共享的类型和白名单
docs/
  screenshots/ README 截图
scripts/      构建后处理（Excalidraw 字体拷贝）
fixtures/     渲染能力验收用的示例文档
```

技术栈：Electron 45、electron-vite 6、React 19、TypeScript 7、CodeMirror 6、react-markdown、remark / rehype、KaTeX、Mermaid、Excalidraw。

## 隐私

文档内容、编辑草稿和设置都只保存在本机。应用不包含账号系统、统计或遥测上报。只有在文档引用远程图片，或你主动点击外部链接时，才会访问网络。

## 参与贡献

欢迎提交 Issue 和 Pull Request。提交前请确保：

```bash
npm run build
```

类型检查与构建通过，并尽量在 `fixtures/demo.md` 上验证 Markdown 渲染、编辑保存和查找没有回归。

## 许可证

[MIT](LICENSE)
