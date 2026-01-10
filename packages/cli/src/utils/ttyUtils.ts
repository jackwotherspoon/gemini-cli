/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as tty from 'node:tty';

/**
 * Check if stdin is a TTY. Uses multiple methods for compatibility
 * with Bun compiled binaries where process.stdin.isTTY may be undefined.
 */
export function isStdinTTY(): boolean {
  // First try the standard Node.js way
  if (process.stdin.isTTY === true) {
    return true;
  }
  // Fallback for Bun compiled binaries: use tty.isatty()
  try {
    return tty.isatty(0); // 0 = stdin file descriptor
  } catch {
    return false;
  }
}

/**
 * Check if stdout is a TTY. Uses multiple methods for compatibility
 * with Bun compiled binaries where process.stdout.isTTY may be undefined.
 */
export function isStdoutTTY(): boolean {
  // First try the standard Node.js way
  if (process.stdout.isTTY === true) {
    return true;
  }
  // Fallback for Bun compiled binaries: use tty.isatty()
  try {
    return tty.isatty(1); // 1 = stdout file descriptor
  } catch {
    return false;
  }
}
