import type { ILogService } from '@/logger/common'

type LoggerLike = Pick<ILogService, 'log' | 'info' | 'debug'> | Console;

const now = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

export class StartupTiming {
  private readonly start: number;
  private readonly marks = new Map<string, number>();
  private logger?: LoggerLike;

  constructor(private readonly label: string, logger?: LoggerLike) {
    this.start = now();
    this.marks.set('start', this.start);
    this.logger = logger;
    this.emit('start');
  }

  setLogger(logger?: LoggerLike) {
    if (logger) {
      this.logger = logger;
    }
  }

  mark(name: string, extra?: unknown) {
    const t = now();
    this.marks.set(name, t);
    const delta = t - this.start;
    this.emit(`${name} +${delta.toFixed(1)}ms`, extra);
    return t;
  }

  measure(name: string, from: string, to: string) {
    const start = this.marks.get(from);
    const end = this.marks.get(to);
    if (start === undefined || end === undefined) {
      return undefined;
    }
    const duration = end - start;
    this.emit(`${name} ${duration.toFixed(1)}ms (${from} -> ${to})`);
    return duration;
  }

  private emit(message: string, extra?: unknown) {
    const prefix = `[startup:${this.label}]`;
    const logger = this.logger;
    if (logger && 'log' in logger && typeof logger.log === 'function') {
      if (extra !== undefined) {
        logger.log(prefix, message, extra);
      } else {
        logger.log(prefix, message);
      }
      return;
    }
    if (logger && 'info' in logger && typeof logger.info === 'function') {
      if (extra !== undefined) {
        logger.info(prefix, message, extra);
      } else {
        logger.info(prefix, message);
      }
      return;
    }
    if (extra !== undefined) {
      // eslint-disable-next-line no-console
      console.log(prefix, message, extra);
    } else {
      // eslint-disable-next-line no-console
      console.log(prefix, message);
    }
  }
}

const timingByLabel = new Map<string, StartupTiming>();

export const getStartupTiming = (label: string, logger?: LoggerLike) => {
  let timing = timingByLabel.get(label);
  if (!timing) {
    timing = new StartupTiming(label, logger);
    timingByLabel.set(label, timing);
  } else if (logger) {
    timing.setLogger(logger);
  }
  return timing;
};
