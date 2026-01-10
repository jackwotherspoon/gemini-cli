/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PTY adapter abstraction layer.
 *
 * Uses bun-pty library for cross-platform PTY support.
 * bun-pty works on all platforms (Linux, macOS, Windows) via Rust FFI.
 */

import { debugLogger } from './debugLogger.js';

export type PtyBackend = 'bun-pty';

/**
 * Represents a spawned PTY process.
 */
export interface PtyInstance {
  /** Process ID of the spawned process */
  readonly pid: number;

  /** Register a callback for data received from the PTY */
  onData(callback: (data: string) => void): void;

  /** Register a callback for when the PTY process exits */
  onExit(callback: (e: { exitCode: number; signal?: number }) => void): void;

  /** Write data to the PTY */
  write(data: string): void;

  /** Kill the PTY process */
  kill(signal?: string): void;

  /** Resize the PTY */
  resize(cols: number, rows: number): void;
}

/**
 * Options for spawning a PTY process.
 */
export interface PtySpawnOptions {
  /** Terminal name (e.g., 'xterm-256color') */
  name?: string;
  /** Number of columns */
  cols?: number;
  /** Number of rows */
  rows?: number;
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Enable flow control (XON/XOFF) */
  handleFlowControl?: boolean;
}

/**
 * PTY adapter interface for spawning and managing pseudo-terminals.
 */
export interface PtyAdapter {
  /** The backend being used */
  backend: PtyBackend;

  /** Spawn a new PTY process */
  spawn(command: string, args: string[], options: PtySpawnOptions): PtyInstance;
}

// Cache the bun-pty spawn function
let bunPtySpawn: typeof import('bun-pty').spawn | null = null;

/**
 * Creates a bun-pty adapter for cross-platform PTY support.
 * Uses bun-pty library (Rust FFI) which works on all platforms.
 */
async function createBunPtyAdapter(): Promise<PtyAdapter> {
  if (!bunPtySpawn) {
    const bunPty = await import('bun-pty');
    bunPtySpawn = bunPty.spawn;
  }

  const spawn = bunPtySpawn;

  return {
    backend: 'bun-pty',
    spawn(command, args, options) {
      // Filter out undefined values from env - bun-pty requires string values only
      const cleanEnv: Record<string, string> = {};
      if (options.env) {
        for (const [key, value] of Object.entries(options.env)) {
          if (value !== undefined && value !== null) {
            cleanEnv[key] = String(value);
          }
        }
      }

      const pty = spawn(command, args, {
        name: options.name ?? 'xterm-256color',
        cols: options.cols ?? 80,
        rows: options.rows ?? 24,
        cwd: options.cwd,
        env: cleanEnv,
      });

      return {
        get pid() {
          return pty.pid;
        },
        onData(callback) {
          pty.onData(callback);
        },
        onExit(callback) {
          pty.onExit(({ exitCode }: { exitCode: number }) =>
            callback({ exitCode }),
          );
        },
        write(data) {
          pty.write(data);
        },
        kill() {
          pty.kill();
        },
        resize(cols, rows) {
          pty.resize(cols, rows);
        },
      };
    },
  };
}

/**
 * Creates the PTY adapter using bun-pty.
 *
 * bun-pty provides cross-platform PTY support via Rust FFI.
 * Works on Linux, macOS, and Windows.
 *
 * @returns A PTY adapter or null if PTY is not available
 */
export async function createPtyAdapter(): Promise<PtyAdapter | null> {
  // Check if we're running in Bun
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isBun = typeof (globalThis as any).Bun !== 'undefined';

  if (!isBun) {
    // Not running in Bun, bun-pty won't work
    return null;
  }

  try {
    return await createBunPtyAdapter();
  } catch (e) {
    // bun-pty not available or failed to load
    debugLogger.debug('Failed to create bun-pty adapter:', e);
    return null;
  }
}
