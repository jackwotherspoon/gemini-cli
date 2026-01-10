#!/usr/bin/env bun

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Full release build script for @google/gemini-cli.
 *
 * This script:
 * 1. Bundles the CLI with esbuild
 * 2. Builds platform-specific binaries for all targets
 * 3. Creates the wrapper package with launcher
 *
 * Usage:
 *   bun run scripts/build-release.ts              # Build all platforms
 *   bun run scripts/build-release.ts --single     # Build current platform only
 *   bun run scripts/build-release.ts --baseline   # Include baseline builds
 *
 * Output:
 *   ./dist/@google/gemini-cli/           (wrapper package)
 *   ./dist/@google/gemini-cli-<platform>-<arch>/  (platform binaries)
 */

import { $ } from 'bun';

const singleFlag = process.argv.includes('--single');
const baselineFlag = process.argv.includes('--baseline');

console.log('='.repeat(60));
console.log('Building Gemini CLI Release');
console.log('='.repeat(60));
console.log(`Mode: ${singleFlag ? 'Single platform' : 'All platforms'}`);
console.log(`Baseline builds: ${baselineFlag ? 'Yes' : 'No'}`);
console.log('');

// Build binaries
const binaryArgs = [];
if (!singleFlag) binaryArgs.push('--all');
if (baselineFlag) binaryArgs.push('--baseline');

console.log('Step 1/2: Building binaries...\n');
const binaryResult =
  await $`bun run scripts/build-binary.ts ${binaryArgs}`.nothrow();
if (binaryResult.exitCode !== 0) {
  console.error('Binary build failed');
  process.exit(1);
}

// Build wrapper
console.log('\nStep 2/2: Building wrapper package...\n');
const wrapperResult = await $`bun run scripts/build-wrapper.ts`.nothrow();
if (wrapperResult.exitCode !== 0) {
  console.error('Wrapper build failed');
  process.exit(1);
}

console.log('\n' + '='.repeat(60));
console.log('Release build complete!');
console.log('='.repeat(60));
console.log('\nOutput in ./dist/:');
await $`ls -la ./dist/@google/`;
