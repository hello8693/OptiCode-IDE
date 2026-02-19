# OptiCode C/C++ Language Features (clangd)

为 OptiCode 提供基于 [clangd](https://clangd.llvm.org/) 的 C/C++ 智能语言支持：

## 功能

- ✅ **代码补全** — 上下文感知的智能补全，支持头文件、函数、变量、类型
- ✅ **实时诊断** — 编辑时即时显示编译错误和警告
- ✅ **转到定义 / 声明** — Ctrl+Click 或 F12
- ✅ **查找引用** — Shift+F12
- ✅ **悬停信息** — 鼠标悬停显示类型、文档
- ✅ **内联提示** — 参数名、类型推断提示
- ✅ **代码格式化** — 基于 `.clang-format` 的格式化
- ✅ **头文件/源文件切换** — 快速在 `.h` 和 `.cpp` 之间跳转
- ✅ **符号搜索** — 工作区内符号全局搜索
- ✅ **自动 compile_commands.json** — 为 OptiCode 单文件/竞赛模式自动生成编译数据库
- ✅ **clangd 自动下载** — 首次使用时自动检测和安装 clangd

## 依赖

需要 `clangd` 语言服务器。首次启动时会自动提示安装。

### 手动安装 clangd

- **macOS**: `brew install llvm` 或 `xcode-select --install`
- **Ubuntu/Debian**: `sudo apt install clangd`
- **Fedora**: `sudo dnf install clang-tools-extra`
- **Windows**: 从 [GitHub Releases](https://github.com/clangd/clangd/releases) 下载

## 配置

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `clangd.path` | `clangd` | clangd 可执行文件路径 |
| `clangd.arguments` | `[]` | 传递给 clangd 的额外命令行参数 |
| `clangd.fallbackFlags` | `["-std=c++20", "-Wall"]` | 无 compile_commands.json 时的编译参数 |
| `clangd.enableCodeCompletion` | `true` | 启用代码补全 |
| `clangd.enableInlayHints` | `true` | 启用内联提示 |
| `clangd.autoGenerateCompileCommands` | `true` | 自动生成 compile_commands.json |
