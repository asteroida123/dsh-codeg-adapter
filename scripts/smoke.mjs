// Smoke test: boot the dsh-codeg wrapper, then drive the ACP handshake over stdio.
import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
process.env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? 'sk-smoke-test'

const child = spawn(process.execPath, [path.join(root, 'bin', 'dsh-codeg.js')], {
  cwd: root,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env,
})

let stderr = ''
child.stderr.on('data', (d) => { stderr += d; process.stderr.write(d) })
child.on('exit', (code) => { if (code && code !== 0) { console.error('[smoke] wrapper exited', code); console.error(stderr) } })

const timer = setTimeout(() => { console.error('[smoke] timeout'); child.kill(); process.exit(1) }, 90000)

const stream = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout))
const updates = []
const client = new ClientSideConnection((_agent) => ({
  sessionUpdate(params) { updates.push(params); return Promise.resolve() },
  requestPermission(params) { return Promise.resolve({ outcome: { outcome: 'cancelled' } }) },
}), stream)

try {
  console.log('[smoke] PROTOCOL_VERSION (client SDK) =', PROTOCOL_VERSION)
  const init = await client.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} })
  console.log('[smoke] initialize ->', JSON.stringify(init))

  const { sessionId } = await client.newSession({ cwd: process.cwd(), mcpServers: [] })
  console.log('[smoke] session/new -> sessionId =', sessionId)

  const realKey = process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY !== 'sk-smoke-test'
  if (realKey) {
    const res = await client.prompt({ sessionId, prompt: [{ type: 'text', text: 'Reply with exactly: ok' }] })
    console.log('[smoke] session/prompt ->', JSON.stringify(res))
    await new Promise((r) => setTimeout(r, 1500))
    console.log('[smoke] session/update ->', JSON.stringify(updates))
  } else {
    console.log('[smoke] skipping session/prompt (no real DEEPSEEK_API_KEY in env)')
  }
  console.log('[smoke] PASS')
} catch (err) {
  console.error('[smoke] FAIL:', err && err.message ? err.message : String(err))
  if (stderr) console.error('[smoke] stderr:', stderr)
  process.exitCode = 1
} finally {
  clearTimeout(timer)
  child.kill()
}
