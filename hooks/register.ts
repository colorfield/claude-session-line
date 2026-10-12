import type { EngineInterface, Register } from 'claude-code'

import { COMPACT_AT, shortModel, statusLine } from './format'

// A status line under the prompt: how full the context is, which model and
// effort answer, which branch (or worktree) the session works in, and the
// rate-limit windows and cost once they are worth a glance.

// The module's own memory: a reload starts it over, which costs one turn of
// unknown effort at most.
let effort: string | undefined
let hasWarned = false

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await refresh($)
    return started
  })

  // The effort of the main loop's last request (a subagent's is its own).
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && e.effort !== undefined) effort = String(e.effort)
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const answered = await next(e)
    if (e.agentId === undefined) await refresh($)
    return answered
  })

  // /model, /effort, /compact, /clear, /resume and the like change the figures.
  on('command.run', async ($, e, next) => {
    const ran = await next(e)
    if (e.command === 'effort') effort = e.args.trim() || effort
    await refresh($)
    return ran
  }).catch(($, e, next) => next(e))

  // A branch switch in Bash (git checkout, a worktree move) shows at once.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (/\bgit\s+(?:checkout|switch|worktree)\b/.test(e.command)) await refresh($)
    return ran
  }).catch(($, e, next) => next(e))
}

async function branchOf($: EngineInterface, cwd: string): Promise<{ branch: string; isWorktree: boolean } | undefined> {
  const { exitCode, stdout } = await $.process.run(
    ['git', 'rev-parse', '--abbrev-ref', 'HEAD', '--git-dir', '--git-common-dir'],
    { cwd, timeoutMs: 5000 },
  )
  if (exitCode !== 0) return undefined
  const [branch = '', gitDir = '', commonDir = ''] = stdout.trim().split('\n')
  return { branch: branch === 'HEAD' ? 'detached' : branch, isWorktree: gitDir !== commonDir }
}

// Never throws: a status line that cannot be read stays as it was.
async function refresh($: EngineInterface) {
  try {
    await draw($)
  } catch {}
}

async function draw($: EngineInterface) {
  const [usage, model, cwd] = await Promise.all([$.session.usage(), $.session.model(), $.session.cwd()])
  const git = await branchOf($, cwd)
  const percent = usage.context.percent

  $.ui.status(statusLine({
    contextPercent: percent,
    contextTokens: usage.context.tokens,
    contextWindow: usage.context.window,
    model: shortModel(model),
    effort,
    branch: git?.branch,
    isWorktree: git?.isWorktree ?? false,
    rateLimits: usage.rateLimits,
    costUsd: usage.cost?.usd,
  }))

  // One nudge per crossing: it re-arms once a compaction brings it down.
  if (percent !== undefined && percent >= COMPACT_AT && !hasWarned) {
    hasWarned = true
    $.ui.toast(`Context ${Math.round(percent)}% full: /compact now keeps the summary sharp`, { timeoutMs: 8000 })
  }
  if (percent !== undefined && percent < COMPACT_AT) hasWarned = false
}
