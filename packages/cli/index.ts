#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Debug TTY detection - remove after fixing
if (process.env['DEBUG_TTY']) {
  const tty = await import('node:tty');
  console.error('[DEBUG TTY]', {
    'process.stdin.isTTY': process.stdin.isTTY,
    'process.stdout.isTTY': process.stdout.isTTY,
    'tty.isatty(0)': tty.isatty(0),
    'tty.isatty(1)': tty.isatty(1),
    'process.argv': process.argv,
  });
}

import { main } from './src/gemini.js';
import { FatalError, writeToStderr } from '@google/gemini-cli-core';
import { runExitCleanup } from './src/utils/cleanup.js';

// --- Global Entry Point ---
main().catch(async (error) => {
  await runExitCleanup();

  if (error instanceof FatalError) {
    let errorMessage = error.message;
    if (!process.env['NO_COLOR']) {
      errorMessage = `\x1b[31m${errorMessage}\x1b[0m`;
    }
    writeToStderr(errorMessage + '\n');
    process.exit(error.exitCode);
  }
  writeToStderr('An unexpected critical error occurred:');
  if (error instanceof Error) {
    writeToStderr(error.stack + '\n');
  } else {
    writeToStderr(String(error) + '\n');
  }
  process.exit(1);
});
