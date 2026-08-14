# dsh-codeg-adapter

Launch DeepSeek Harness (DSH) as an Agent Client Protocol (ACP) agent for Codeg.

DSH already ships a first-party ACP server (@deepseek-ai/dsh-acp) and a ready app
(@deepseek-ai/dsh-acp-demo). This repo wraps them into one installable command
(dsh-codeg) that:

- pins the DSH rc line so npx doesn't grab the stale 'latest' tag,
- injects DEEPSEEK_API_KEY from env / .env / ~/.dsh/.env,
- points the app at a bundled cordis.yml by absolute path (Codeg launches the agent
  with cwd set to the project, so a relative config would never resolve).

## Install

Requires Node.js >= 20.

```sh
npm install -g @asteroida/dsh-codeg-adapter
# or, once published: npx @asteroida/dsh-codeg-adapter
```

Set the key:

```sh
export DEEPSEEK_API_KEY=sk-...
# or: echo 'DEEPSEEK_API_KEY=sk-...' > ~/.dsh/.env
```

## Register in Codeg

Install dsh-codeg first (global install puts it on PATH; Codeg's launch gate prefers a
PATH-resolved command over the npx fallback):

```sh
npm install -g @asteroida/dsh-codeg-adapter
```

Then add it as a custom agent. Three equivalent ways:

1. **Form (simplest):** Codeg -> Settings -> Custom Agent -> Add, choose the npx channel and
   fill in package `@asteroida/dsh-codeg-adapter@0.1.0`, command `dsh-codeg`, args empty, Node >= 20.
2. **Paste JSON:** paste the contents of `codeg-paste.json` (the stored CustomAgentDef shape).
3. **Registry (after publishing the adapter to the public ACP registry):** pick
   `dsh-acp` from the catalog (see `codeg-agent.json` for the registry-entry shape).

In every case, **turn off MCP forwarding** for this agent (the `supports_mcp` toggle) — the
current DSH ACP bridge rejects `session/new.mcpServers` and the connection fails otherwise.

Then pick the agent in a conversation and send a prompt. Verified end-to-end up to the LLM
call: ACP protocol version is 1 on both sides (Codeg's `ProtocolVersion::LATEST` = V1,
DSH's `PROTOCOL_VERSION` = 1), and `initialize` + `session/new` succeed over stdio.

## What works today (automation-only)

- initialize (version negotiation)
- session/new (fresh session, per-session cwd)
- session/prompt (one in-flight prompt per session) -> committed assistant/message text
- per-session cancellation, concurrent sessions, teardown on disconnect
- one-shot session/request_permission (allow-once / reject-once / cancel)

## Known gaps (upstream design)

DSH's ACP bridge is deliberately automation-only:

- no session/load / session/resume / session/fork (fresh sessions only; Codeg falls
  back to fresh sessions since these are not advertised)
- session/new.mcpServers is rejected (hence the supports_mcp=false step)
- only committed text is emitted (no tool traces / diffs / terminal on the ACP wire)
- no commands / modes / model switching / plan review / human elicitation

The gap that matters most for Codeg is MCP. Since the DSH repo does not accept public
merges today, the path is to fork @deepseek-ai/dsh-acp (MIT) in this repo and patch
newSession to accept mcpServers and wire them into @deepseek-ai/dsh-mcp-client.

## Development

```sh
npm install
npm run smoke   # boots the ACP server, sends initialize + session/new, prints results
```

The smoke test does not need a real key (only session/prompt calls the model); it sets
a dummy DEEPSEEK_API_KEY so the wrapper's boot path runs unchanged.
## 边界与非目标（为什么是薄壳，而不是适配器）

**本仓库不实现任何 ACP 能力**——ACP 能力全部来自上游已发布的
`@deepseek-ai/dsh-acp` + `@deepseek-ai/dsh-acp-demo`。本仓库只做打包与启动：锁版本、声明
叶子插件依赖、内置 `cordis.yml`、绝对路径、key 注入、文档化 `supports_mcp=false`。

因此**没有本仓库 codeg 也能调用 DSH**：手动安装 `dsh-acp-demo` 及 11 个叶子插件、手写
`cordis.yml`、处理 cwd 与 key，再注册 `dsh-acp-demo -c /abs/cordis.yml` 即可。本仓库只是
把这串收成一条 `npm install` + 一次注册。

### 已知边界（DSH 上游 automation-only 设计，非本仓库可修）

- **无 `session/resume` / `load` / `fork`**：在 codeg 里「继续」一段 DSH 对话时，重连后
  agent 全新启动、丢失上下文（codeg 只加 `continues_from` 链接，不重放历史）。同一连接内
  的多轮不受影响。
- **无 MCP 转发**：必须在 codeg 里关掉 `supports_mcp`，否则 `session/new` 会被拒绝。
- **仅提交文本**：无 tool 轨迹 / diff / terminal 上 ACP 线。

### 三条路线的结论

- **A（本仓库，现状）**：已达成 codeg 一等公民集成，**停止于此**。codeg 里其他 agent 本身
  就能力参差（OpenClaw 无 MCP、Pi 丢弃 MCP、多数无 steering），DSH 的边界是正常光谱。
- **B（vendor 桥补 resume / 富 update）**：不推荐。resume 收益窄（仅「重连不失忆」），且逆
  上游设计方向、需长期维护 fork。若上游将来把 resume 加回 bridge，本仓库自动受益。
- **C（补 MCP）**：除非有明确刚需，否则不做。需 vendor `dsh-acp` + `dsh-mcp-client`
  （其 `startConnection` 不导出）+ 用 `dsh-scope` 做 session 级工具隔离，是一个独立工程。

