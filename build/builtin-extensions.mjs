import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const extensionsDir = path.join(repoRoot, 'extensions');

const builtinExtensions = [
  {
    id: 'opticode.cpp-debug',
    dir: path.join(repoRoot, 'builtin-extensions', 'opticode.cpp-debug'),
  },
  {
    id: 'opticode.cpp-language-features',
    dir: path.join(repoRoot, 'builtin-extensions', 'opticode.cpp-language-features'),
  },
];

const skipBuild = process.argv.includes('--skip-build');
const skipSync = process.argv.includes('--skip-sync');

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} failed with code ${code}`));
    });
  });
}

async function buildExtension(ext) {
  const buildScript = path.join(ext.dir, 'esbuild.mjs');
  if (!fs.existsSync(buildScript)) return;
  await run('node', [buildScript], ext.dir);
}

async function syncExtension(ext) {
  const devInstall = path.join(ext.dir, 'scripts', 'dev-install.mjs');
  if (fs.existsSync(devInstall)) {
    await run('node', [devInstall], ext.dir);
    return;
  }

  const targetDir = path.join(extensionsDir, ext.id);
  await fsp.mkdir(targetDir, { recursive: true });
  const items = ['dist', 'package.json', 'README.md', 'snippets', 'clangd'];
  for (const item of items) {
    const src = path.join(ext.dir, item);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(targetDir, item);
    await fsp.rm(dest, { recursive: true, force: true }).catch(() => {});
    await fsp.cp(src, dest, { recursive: true });
  }
}

async function verifyExtension(ext) {
  const pkgPath = path.join(extensionsDir, ext.id, 'package.json');
  const mainPath = path.join(extensionsDir, ext.id, 'dist', 'extension.js');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`builtin extension missing package.json: ${pkgPath}`);
  }
  if (!fs.existsSync(mainPath)) {
    throw new Error(`builtin extension missing dist: ${mainPath}`);
  }
}

async function main() {
  await fsp.mkdir(extensionsDir, { recursive: true });

  if (!skipBuild) {
    for (const ext of builtinExtensions) {
      await buildExtension(ext);
    }
  }

  if (!skipSync) {
    for (const ext of builtinExtensions) {
      await syncExtension(ext);
    }
  }

  for (const ext of builtinExtensions) {
    await verifyExtension(ext);
  }
}

main().catch((err) => {
  console.error('[builtin-extensions] failed:', err);
  process.exit(1);
});
