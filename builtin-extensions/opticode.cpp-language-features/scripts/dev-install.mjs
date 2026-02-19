import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const srcDir = path.resolve(__dirname, '..');
  // 在仓库根目录的 extensions/ 下同步，便于开发模式加载（该目录在 gitignore 中）
  const targetDir = path.resolve(__dirname, '..', '..', '..', 'extensions', 'opticode.cpp-language-features');

  await fsp.mkdir(targetDir, { recursive: true });

  const items = ['dist', 'package.json', 'README.md', 'clangd', 'snippets'];
  for (const item of items) {
    const src = path.join(srcDir, item);
    if (!fs.existsSync(src)) continue; // optional items (e.g., clangd)
    const dest = path.join(targetDir, item);
    await fsp.rm(dest, { recursive: true, force: true }).catch(() => {});
    await fsp.cp(src, dest, { recursive: true });
  }

  console.log(`[dev-install] synced to ${targetDir}`);
}

main().catch((err) => {
  console.error('[dev-install] failed:', err);
  process.exit(1);
});
