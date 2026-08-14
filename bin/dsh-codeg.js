#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

function loadDotEnv(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8')
    for (const raw of txt.split(/\r?\n/)) {
      const m = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^['\"]|['\"]$/g, '')
      }
    }
  } catch {
    // missing file is fine
  }
}

if (!process.env.DEEPSEEK_API_KEY) {
  loadDotEnv(path.join(root, '.env'))
  loadDotEnv(path.join(os.homedir(), '.dsh', '.env'))
}

if (!process.env.DEEPSEEK_API_KEY) {
  process.stderr.write(
    'dsh-codeg: DEEPSEEK_API_KEY is not set. Export it, or add it to ' +
      path.join(root, '.env') + ' or ' + path.join(os.homedir(), '.dsh', '.env') +
      ' (the agent will boot, but prompts will fail without it).\n'
  )
}

let bin
try {
  bin = require.resolve('@deepseek-ai/dsh-acp-demo/bin')
} catch {
  process.stderr.write('dsh-codeg: @deepseek-ai/dsh-acp-demo is not installed (run npm install first)\n')
  process.exit(2)
}

const cordisYml = path.join(root, 'cordis.yml')
const child = spawn(process.execPath, [bin, '-c', cordisYml], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})

child.on('error', (err) => {
  process.stderr.write('dsh-codeg: failed to start ' + bin + ': ' + err.message + '\n')
  process.exit(2)
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
