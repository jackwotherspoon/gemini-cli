#!/usr/bin/env bun

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Creates the wrapper package for gemini-cli.
 *
 * The wrapper package:
 * 1. Has optionalDependencies on all platform-specific binary packages
 * 2. Contains a launcher script that detects platform and runs the correct binary
 *
 * Usage:
 *   bun run scripts/build-wrapper.ts
 *
 * Output:
 *   ./dist/bun-gemini-cli/
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

// Read package.json for version
const pkg = await Bun.file(join(root, 'package.json')).json();
const version = pkg.version as string;

// Package name prefix - change this to test with a different npm account
const PACKAGE_PREFIX = 'bun-gemini-cli';

console.log(`Creating wrapper package v${version}...`);

// Define all platform packages
const platformPackages = [
  `${PACKAGE_PREFIX}-darwin-arm64`,
  `${PACKAGE_PREFIX}-darwin-x64`,
  `${PACKAGE_PREFIX}-darwin-x64-baseline`,
  `${PACKAGE_PREFIX}-linux-arm64`,
  `${PACKAGE_PREFIX}-linux-arm64-musl`,
  `${PACKAGE_PREFIX}-linux-x64`,
  `${PACKAGE_PREFIX}-linux-x64-baseline`,
  `${PACKAGE_PREFIX}-linux-x64-musl`,
  `${PACKAGE_PREFIX}-linux-x64-musl-baseline`,
  `${PACKAGE_PREFIX}-windows-x64`,
  `${PACKAGE_PREFIX}-windows-x64-baseline`,
];

// Create optionalDependencies object
const optionalDependencies: Record<string, string> = {};
for (const pkg of platformPackages) {
  optionalDependencies[pkg] = version;
}

// Output directory
const outputDir = `./dist/${PACKAGE_PREFIX}`;
await Bun.write(`${outputDir}/.gitkeep`, '');

// Create package.json
const wrapperPkg = {
  name: PACKAGE_PREFIX,
  version,
  description: 'Gemini CLI - AI-powered command-line interface',
  type: 'module',
  license: 'Apache-2.0',
  repository: {
    type: 'git',
    url: 'git+https://github.com/jackwotherspoon/gemini-cli.git',
  },
  bin: {
    gemini: 'bin/gemini',
  },
  files: ['bin'],
  optionalDependencies,
};

await Bun.write(
  `${outputDir}/package.json`,
  JSON.stringify(wrapperPkg, null, 2),
);
console.log('✓ Created package.json');

// Create bin directory
const binDir = `${outputDir}/bin`;
await Bun.write(`${binDir}/.gitkeep`, '');

// Create launcher script using ESM
const launcherScript = `#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Launcher script for gemini-cli.
 * Detects the current platform and runs the appropriate binary.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, existsSync, realpathSync } from 'node:fs';
import { platform as osPlatform, arch as osArch } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function run(target) {
  const result = spawnSync(target, process.argv.slice(2), {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  const code = typeof result.status === 'number' ? result.status : 0;
  process.exit(code);
}

// Allow override via environment variable
const envPath = process.env.GEMINI_BIN_PATH;
if (envPath) {
  run(envPath);
}

// Map platform/arch names
const platformMap = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows',
};

const archMap = {
  x64: 'x64',
  arm64: 'arm64',
};

const platform = platformMap[osPlatform()] || osPlatform();
const arch = archMap[osArch()] || osArch();

// Check for musl libc on Linux
let suffix = '';
if (osPlatform() === 'linux') {
  try {
    const lddOutput = execFileSync('ldd', ['--version'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (lddOutput.includes('musl')) {
      suffix = '-musl';
    }
  } catch {
    // If ldd fails, try checking /lib for musl
    try {
      const libFiles = readdirSync('/lib');
      if (libFiles.some((f) => f.includes('musl'))) {
        suffix = '-musl';
      }
    } catch {
      // Assume glibc
    }
  }
}

const base = '${PACKAGE_PREFIX}-' + platform + '-' + arch + suffix;
const binary = platform === 'windows' ? 'gemini.exe' : 'gemini';

function findBinary(startDir) {
  let current = startDir;
  for (;;) {
    const modules = join(current, 'node_modules');
    if (existsSync(modules)) {
      const entries = readdirSync(modules);
      for (const entry of entries) {
        // Try exact match first, then baseline
        if (entry === base || entry === base + '-baseline') {
          const candidate = join(modules, entry, 'bin', binary);
          if (existsSync(candidate)) {
            return candidate;
          }
        }
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

const scriptPath = realpathSync(__filename);
const scriptDir = dirname(scriptPath);
const resolved = findBinary(scriptDir);

if (!resolved) {
  console.error(
    'It seems that your package manager failed to install the right version of gemini-cli for your platform.\\n' +
    'You can try manually installing the "' + base + '" package.\\n\\n' +
    'Supported platforms:\\n' +
    '  - macOS (Apple Silicon): ${PACKAGE_PREFIX}-darwin-arm64\\n' +
    '  - macOS (Intel): ${PACKAGE_PREFIX}-darwin-x64\\n' +
    '  - Linux (ARM64): ${PACKAGE_PREFIX}-linux-arm64\\n' +
    '  - Linux (x64): ${PACKAGE_PREFIX}-linux-x64\\n' +
    '  - Linux (x64 musl): ${PACKAGE_PREFIX}-linux-x64-musl\\n' +
    '  - Windows (x64): ${PACKAGE_PREFIX}-windows-x64\\n\\n' +
    'Please report this issue at https://github.com/google-gemini/gemini-cli/issues'
  );
  process.exit(1);
}

run(resolved);
`;

await Bun.write(`${binDir}/gemini`, launcherScript);
// Make executable on Unix
if (process.platform !== 'win32') {
  const { chmod } = await import('node:fs/promises');
  await chmod(`${binDir}/gemini`, 0o755);
}
console.log('✓ Created launcher script');

console.log(`\n✓ Wrapper package created at ${outputDir}`);
console.log('\nPackage structure:');
console.log(`  ${PACKAGE_PREFIX}/`);
console.log('  ├── package.json');
console.log('  └── bin/gemini (launcher)');
