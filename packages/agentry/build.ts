#!/usr/bin/env bun
import { rm } from 'node:fs/promises'

await rm('dist', { recursive: true, force: true })

console.log('Building ESM bundle...')

const result = await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  format: 'esm',
  target: 'node',
  sourcemap: 'external',
  minify: false,
  naming: {
    entry: 'index.js',
  },
  external: [
    'react',
    'zod',
    '@anthropic-ai/sdk',
    'eventemitter3',
    'react-reconciler',
    'scheduler',
    'zustand',
  ],
})

if (!result.success) {
  console.error('Build failed:', result.logs)
  process.exit(1)
}
