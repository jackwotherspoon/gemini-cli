#!/usr/bin/env bun

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Build script for creating standalone binaries using Bun.
 *
 * This script:
 * 1. Bundles the CLI with esbuild (embeds WASM files)
 * 2. Compiles the bundle into standalone binaries with Bun
 *
 * Usage:
 *   bun run scripts/build-binary.ts              # Build for current platform
 *   bun run scripts/build-binary.ts --all        # Build for all platforms
 *   bun run scripts/build-binary.ts --baseline   # Include baseline builds (no AVX2)
 *   bun run scripts/build-binary.ts --skip-bundle # Skip esbuild step
 *
 * Output:
 *   ./dist/@google/gemini-cli-<platform>-<arch>/bin/gemini[.exe]
 */

import { $ } from 'bun';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

process.chdir(root);

// Read package.json for version
const pkg = await Bun.file(join(root, 'package.json')).json();
const version = pkg.version as string;

// Parse flags
const allFlag = process.argv.includes('--all');
const baselineFlag = process.argv.includes('--baseline');
const skipBundleFlag = process.argv.includes('--skip-bundle');

// Define all build targets
interface BuildTarget {
  os: 'linux' | 'darwin' | 'win32';
  arch: 'arm64' | 'x64';
  abi?: 'musl';
  avx2?: false;
}

const allTargets: BuildTarget[] = [
  // Linux glibc
  { os: 'linux', arch: 'arm64' },
  { os: 'linux', arch: 'x64' },
  { os: 'linux', arch: 'x64', avx2: false },
  // Linux musl (Alpine, etc.)
  { os: 'linux', arch: 'arm64', abi: 'musl' },
  { os: 'linux', arch: 'x64', abi: 'musl' },
  { os: 'linux', arch: 'x64', abi: 'musl', avx2: false },
  // macOS
  { os: 'darwin', arch: 'arm64' },
  { os: 'darwin', arch: 'x64' },
  { os: 'darwin', arch: 'x64', avx2: false },
  // Windows
  { os: 'win32', arch: 'x64' },
  { os: 'win32', arch: 'x64', avx2: false },
];

// Filter targets based on flags
function getTargets(): BuildTarget[] {
  if (allFlag) {
    if (baselineFlag) {
      return allTargets;
    }
    // Without --baseline, exclude baseline builds
    return allTargets.filter((t) => t.avx2 !== false);
  }

  // Single platform: current platform only
  const currentTarget: BuildTarget = {
    os: process.platform as 'linux' | 'darwin' | 'win32',
    arch: process.arch as 'arm64' | 'x64',
  };

  if (baselineFlag) {
    return [currentTarget, { ...currentTarget, avx2: false }];
  }

  return [currentTarget];
}

// Package name prefix - change this to test with a different npm account
const PACKAGE_PREFIX = 'bun-gemini-cli';

// Generate package name for a target
function getPackageName(target: BuildTarget): string {
  const parts = [
    PACKAGE_PREFIX,
    // npm doesn't like 'win32', use 'windows' instead
    target.os === 'win32' ? 'windows' : target.os,
    target.arch,
    target.avx2 === false ? 'baseline' : undefined,
    target.abi,
  ].filter(Boolean);
  return parts.join('-');
}

// Generate Bun target string
function getBunTarget(target: BuildTarget): string {
  const parts = [
    'bun',
    target.os,
    target.arch,
    target.avx2 === false ? 'baseline' : undefined,
  ].filter(Boolean);
  return parts.join('-');
}

const targets = getTargets();

console.log(`Building ${targets.length} target(s)...`);
console.log(`Version: ${version}`);
console.log(`Targets: ${targets.map(getBunTarget).join(', ')}`);

// Step 1: Bundle with esbuild (handles WASM embedding)
const bundlePath = './bundle/gemini.js';

if (!skipBundleFlag) {
  console.log('\n=== Step 1: Creating esbuild bundle ===');

  // Generate git commit info (required by bundle)
  await $`node scripts/generate-git-commit-info.js`;

  // Run esbuild bundle
  const bundleProcess = Bun.spawn(['node', 'esbuild.config.js'], {
    cwd: root,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const bundleExitCode = await bundleProcess.exited;
  if (bundleExitCode !== 0) {
    console.error(`esbuild bundle failed with exit code ${bundleExitCode}`);
    process.exit(bundleExitCode);
  }

  if (!existsSync(bundlePath)) {
    console.error(`Bundle not found at ${bundlePath}`);
    process.exit(1);
  }

  // Post-process bundle to fix duplicate import declarations
  // Some dependencies (like fdir) have top-level imports that conflict with the banner
  console.log('Post-processing bundle for Bun compatibility...');
  const bundleContent = await Bun.file(bundlePath).text();

  const lines = bundleContent.split('\n');
  const processedLines = lines.map((line, index) => {
    // Skip the first two lines (shebang and banner)
    if (index < 2) return line;

    // Replace duplicate createRequire imports with a locally-scoped version
    if (line.includes('import { createRequire }')) {
      return line.replace(
        'import { createRequire } from "module";',
        'const __fdir_createRequire = (await import("module")).createRequire;',
      );
    }
    return line;
  });

  await Bun.write(bundlePath, processedLines.join('\n'));
  console.log('✓ Bundle created and post-processed');
} else {
  console.log('\n=== Step 1: Skipping bundle (--skip-bundle) ===');
  if (!existsSync(bundlePath)) {
    console.error(
      `Bundle not found at ${bundlePath}. Run without --skip-bundle first.`,
    );
    process.exit(1);
  }
}

// Step 2: Clean dist directory
console.log('\n=== Step 2: Preparing dist directory ===');
await $`rm -rf dist`;
await $`mkdir -p dist`;

// Step 3: Build binaries for each target
console.log('\n=== Step 3: Building binaries ===');

const results: Record<string, { success: boolean; error?: string }> = {};

for (const target of targets) {
  const packageName = getPackageName(target);
  const bunTarget = getBunTarget(target);
  const isWindows = target.os === 'win32';
  const binaryName = isWindows ? 'gemini.exe' : 'gemini';
  const outputDir = `./dist/${packageName}`;
  const outputPath = `${outputDir}/bin/${binaryName}`;

  console.log(`\nBuilding ${packageName}...`);

  try {
    // Create output directory
    await $`mkdir -p ${outputDir}/bin`;

    // Build arguments
    const compileArgs = [
      'build',
      '--compile',
      '--target',
      bunTarget,
      bundlePath,
      '--outfile',
      outputPath,
    ];

    // Run bun build
    const buildProcess = Bun.spawn(['bun', ...compileArgs], {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await buildProcess.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(buildProcess.stderr).text();
      throw new Error(`Build failed with exit code ${exitCode}: ${stderr}`);
    }

    // Verify binary was created
    if (!existsSync(outputPath)) {
      throw new Error(`Binary not found at ${outputPath}`);
    }

    // Create package.json for this platform package
    const platformPkg = {
      name: packageName,
      version,
      description: `Gemini CLI binary for ${target.os} ${target.arch}${target.avx2 === false ? ' (baseline)' : ''}${target.abi ? ` (${target.abi})` : ''}`,
      license: 'Apache-2.0',
      repository: {
        type: 'git',
        url: 'git+https://github.com/jackwotherspoon/gemini-cli.git',
      },
      os: [target.os],
      cpu: [target.arch],
      bin: {
        gemini: `bin/${binaryName}`,
      },
    };

    await Bun.write(
      `${outputDir}/package.json`,
      JSON.stringify(platformPkg, null, 2),
    );

    results[packageName] = { success: true };
    console.log(`✓ ${packageName}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results[packageName] = { success: false, error: errorMessage };
    console.error(`✗ ${packageName}: ${errorMessage}`);
  }
}

// Summary
console.log('\n=== Build Summary ===');
const successful = Object.entries(results).filter(([, r]) => r.success);
const failed = Object.entries(results).filter(([, r]) => !r.success);

console.log(`\nSuccessful: ${successful.length}/${targets.length}`);
for (const [name] of successful) {
  console.log(`  ✓ ${name}`);
}

if (failed.length > 0) {
  console.log(`\nFailed: ${failed.length}/${targets.length}`);
  for (const [name, result] of failed) {
    console.log(`  ✗ ${name}: ${result.error}`);
  }
  process.exit(1);
}

console.log(`\nBinaries written to ./dist/`);
console.log(`\nTo test locally:`);
const firstTarget = targets[0];
const testPackage = getPackageName(firstTarget);
const testBinary = firstTarget.os === 'win32' ? 'gemini.exe' : 'gemini';
console.log(`  ./dist/${testPackage}/bin/${testBinary} --version`);
