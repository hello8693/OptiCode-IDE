# Bundled Toolchains

Place bundled toolchains under this folder before packaging.
Only Windows prefers bundled toolchains. macOS/Linux use system-installed tools and ignore this folder.

Recommended layout for Windows (mingw-w64):

- tools/mingw64/bin/gdb.exe
- tools/mingw64/bin/g++.exe
- tools/mingw64/bin/gcc.exe

Recommended layout for clangd (Windows only, use .exe on Windows):

- tools/llvm/bin/clangd
- tools/clangd/bin/clangd

This folder is copied into the app's resources directory at build time.
