/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { createPtyAdapter } from './pty-adapter.js';

describe('pty-adapter', () => {
  describe('createPtyAdapter', () => {
    it('should create an adapter (or null if not in Bun runtime)', async () => {
      const adapter = await createPtyAdapter();
      // Adapter may be null if not running in Bun runtime
      if (adapter) {
        expect(adapter.backend).toMatch(/^(bun-terminal|bun-pty)$/);
      } else {
        // Expected when running under Node.js (vitest)
        expect(adapter).toBeNull();
      }
    });

    it('should spawn a simple command and receive output', async () => {
      const adapter = await createPtyAdapter();
      if (!adapter) {
        // Skip test if PTY not available
        return;
      }

      const output: string[] = [];
      let exitCode: number | undefined;

      const pty = adapter.spawn('echo', ['hello'], {
        cols: 80,
        rows: 24,
      });

      expect(pty.pid).toBeGreaterThan(0);

      pty.onData((data) => {
        output.push(data);
      });

      await new Promise<void>((resolve) => {
        pty.onExit((e) => {
          exitCode = e.exitCode;
          resolve();
        });
      });

      expect(exitCode).toBe(0);
      expect(output.join('')).toContain('hello');
    });

    it('should support resize', async () => {
      const adapter = await createPtyAdapter();
      if (!adapter) {
        return;
      }

      const pty = adapter.spawn('sh', ['-c', 'sleep 0.1'], {
        cols: 80,
        rows: 24,
      });

      // Should not throw
      pty.resize(120, 40);

      await new Promise<void>((resolve) => {
        pty.onExit(() => resolve());
      });
    });

    it('should support write', async () => {
      const adapter = await createPtyAdapter();
      if (!adapter) {
        return;
      }

      const output: string[] = [];

      const pty = adapter.spawn('cat', [], {
        cols: 80,
        rows: 24,
      });

      pty.onData((data) => {
        output.push(data);
      });

      pty.write('test input\n');

      // Wait a bit for output
      await new Promise((resolve) => setTimeout(resolve, 100));

      pty.kill();

      await new Promise<void>((resolve) => {
        pty.onExit(() => resolve());
      });

      expect(output.join('')).toContain('test input');
    });
  });
});
