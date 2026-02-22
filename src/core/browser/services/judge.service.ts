import { Injectable } from '@opensumi/di';
import { electronEnv } from '@opensumi/ide-core-browser';

import { IJudgeService, JudgeOptions } from '../../common/judge';
import { ISampleCase, ISampleResult, Verdict } from '../../common/sample-data';
import { IProblem, DEFAULT_MEMORY_LIMIT, DEFAULT_TIME_LIMIT } from '../../common/problem';

declare const __non_webpack_require__: NodeRequire | undefined;

interface SpawnSpec {
  command: string;
  args: string[];
  shell: boolean;
  withTime: boolean;
}

type NodeApis = {
  spawn: typeof import('child_process').spawn;
  platform: typeof import('os').platform;
};

let cachedNodeApis: NodeApis | null | undefined;

function getNodeApis(): NodeApis | null {
  if (cachedNodeApis !== undefined) return cachedNodeApis;
  if (!electronEnv.isElectronRenderer) {
    cachedNodeApis = null;
    return cachedNodeApis;
  }
  const nodeRequire =
    typeof __non_webpack_require__ === 'function'
      ? __non_webpack_require__
      : typeof (globalThis as any).require === 'function'
        ? (globalThis as any).require
        : undefined;
  if (!nodeRequire) {
    cachedNodeApis = null;
    return cachedNodeApis;
  }
  try {
    const childProcess = nodeRequire('child_process') as typeof import('child_process');
    const os = nodeRequire('os') as typeof import('os');
    cachedNodeApis = { spawn: childProcess.spawn, platform: os.platform };
  } catch {
    cachedNodeApis = null;
  }
  return cachedNodeApis;
}

function normalizeOutput(s: string): string {
  return s.replace(/\r\n/g, '\n').trimEnd();
}

function nowNs(): bigint {
  if (typeof process !== 'undefined' && process.hrtime?.bigint) {
    return process.hrtime.bigint();
  }
  const nowMs = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  return BigInt(Math.floor(nowMs * 1e6));
}

function buildSpawnSpec(executablePath: string, memoryLimitMb: number | undefined, osPlatform: string): SpawnSpec {
  const memMb = memoryLimitMb && memoryLimitMb > 0 ? memoryLimitMb : undefined;
  const os = osPlatform;

  if (os === 'win32') {
    return { command: executablePath, args: [], shell: false, withTime: false };
  }

  // Linux: 优先尝试 systemd-run --user --scope MemoryMax=...，失败则回退到 ulimit。
  if (os === 'linux' && memMb) {
    const bytes = Math.max(1, Math.floor(memMb * 1024 * 1024));
    return {
      command: 'systemd-run',
      args: ['--user', '--scope', `-p`, `MemoryMax=${bytes}`, '/usr/bin/time', '-p', executablePath],
      shell: false,
      withTime: true,
    };
  }

  const limits: string[] = [];
  if (memMb) {
    // macOS 的 /bin/bash 默认不允许调整 data seg，直接跳过避免报错；Linux 回退 ulimit -v。
    if (os === 'linux') {
      limits.push(`ulimit -v ${Math.floor(memMb * 1024)}`);
    }
  }
  if (limits.length === 0) {
    return { command: '/usr/bin/time', args: ['-p', executablePath], shell: false, withTime: true };
  }

  const cmd = [...limits, `/usr/bin/time -p "${executablePath}"`].filter(Boolean).join(' && ');
  return { command: '/bin/bash', args: ['-lc', cmd], shell: false, withTime: true };
}

@Injectable()
export class JudgeService implements IJudgeService {
  async runSample(
    problem: IProblem,
    sample: ISampleCase,
    options?: JudgeOptions,
  ): Promise<ISampleResult> {
    const apis = getNodeApis();
    if (!apis) {
      return {
        caseId: sample.id,
        verdict: 'RE',
        stdout: '',
        stderr: 'Web 端不支持本地运行样例',
        timeMs: 0,
        exitCode: -1,
      };
    }
    const timeLimitMs = Math.max(1, options?.timeLimitMs || problem.meta.timeLimitMs || DEFAULT_TIME_LIMIT);
    const memoryLimitMb = options?.memoryLimitMb || problem.meta.memoryLimitMb || DEFAULT_MEMORY_LIMIT;

    const osPlatform = apis.platform();
    const { command, args, shell, withTime } = buildSpawnSpec(problem.executablePath, memoryLimitMb, osPlatform);
    const startHr = nowNs();
    let timedOut = false;
    let exitSignal: NodeJS.Signals | null = null;

    const child = apis.spawn(command, args, {
      cwd: problem.rootDir,
      shell,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }, timeLimitMs);

    let stdout = '';
    let stderr = '';

    child.stdin.write(sample.input || '');
    child.stdin.end();

    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });

    const exitCode: number = await new Promise(resolve => {
      child.on('exit', (code, signal) => {
        exitSignal = signal;
        clearTimeout(timer);
        resolve(typeof code === 'number' ? code : -1);
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve(-1);
      });
    });

    let timeMs = Number((nowNs() - startHr) / BigInt(1e6));
    if (withTime) {
      // /usr/bin/time -p outputs to stderr: real X.XX\nuser Y.YY\nsys Z.ZZ
      const matchUser = /user\s+([0-9.]+)/.exec(stderr);
      const matchSys = /sys\s+([0-9.]+)/.exec(stderr);
      if (matchUser && matchSys) {
        const cpuSeconds = parseFloat(matchUser[1]) + parseFloat(matchSys[1]);
        if (!Number.isNaN(cpuSeconds)) {
          timeMs = Math.round(cpuSeconds * 1000);
        }
      }
    }

    let verdict: Verdict;
    const memoryLimited = !timedOut && osPlatform !== 'win32' && !!memoryLimitMb && (exitSignal === 'SIGKILL' || exitCode === 137);

    if (timedOut || timeMs > timeLimitMs) {
      verdict = 'TLE';
    } else if (memoryLimited) {
      verdict = 'MLE';
    } else if (exitCode !== 0) {
      verdict = 'RE';
    } else {
      verdict = normalizeOutput(stdout) === normalizeOutput(sample.expected) ? 'AC' : 'WA';
    }

    return { caseId: sample.id, verdict, stdout, stderr, timeMs, exitCode };
  }

  async runSamples(
    problem: IProblem,
    samples: ISampleCase[],
    options?: JudgeOptions,
  ): Promise<ISampleResult[]> {
    const results: ISampleResult[] = [];
    for (const s of samples) {
      const res = await this.runSample(problem, s, options);
      results.push(res);
    }
    return results;
  }
}
