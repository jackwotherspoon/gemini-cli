/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { RELAUNCH_EXIT_CODE } from './processUtils.js';
import { writeToStderr } from '@google/gemini-cli-core';

export async function relaunchOnExitCode(runner: () => Promise<number>) {
  while (true) {
    try {
      const exitCode = await runner();

      if (exitCode !== RELAUNCH_EXIT_CODE) {
        process.exit(exitCode);
      }
    } catch (error) {
      process.stdin.resume();
      const errorMessage =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      writeToStderr(
        `Fatal error: Failed to relaunch the CLI process.\n${errorMessage}\n`,
      );
      process.exit(1);
    }
  }
}

export async function relaunchAppInChildProcess(
  additionalBunArgs: string[],
  additionalScriptArgs: string[],
) {
  if (process.env['GEMINI_CLI_NO_RELAUNCH']) {
    return;
  }

  const scriptPath = process.argv[1];

  // For compiled binaries, runtime args are already baked in, so skip relaunch
  // Unix uses /$bunfs/root/, Windows uses B:/~BUN/root/
  const isCompiledBinary =
    scriptPath?.startsWith('/$bunfs/') || scriptPath?.startsWith('B:/~BUN/');
  if (isCompiledBinary) {
    return;
  }

  const runner = () => {
    const scriptArgs = process.argv.slice(2);
    const args = [
      ...additionalBunArgs,
      scriptPath,
      ...additionalScriptArgs,
      ...scriptArgs,
    ];
    const newEnv = { ...process.env, GEMINI_CLI_NO_RELAUNCH: 'true' };

    // The parent process should not be reading from stdin while the child is running.
    process.stdin.pause();

    const child = spawn(process.execPath, args, {
      stdio: 'inherit',
      env: newEnv,
    });

    return new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => {
        // Resume stdin before the parent process exits.
        process.stdin.resume();
        resolve(code ?? 1);
      });
    });
  };

  await relaunchOnExitCode(runner);
}
