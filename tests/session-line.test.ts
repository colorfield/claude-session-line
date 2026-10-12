import { describe, expect, test } from 'claude-code/testing'

import { shortModel, statusLine, type Figures } from '../hooks/format'

const BASE: Figures = {
  contextPercent: 42,
  contextTokens: 84_000,
  contextWindow: 200_000,
  model: 'opus 5.5',
  effort: 'high',
  branch: 'main',
  isWorktree: false,
  rateLimits: [],
  costUsd: 1.234,
}

describe('statusLine', () => {
  test('shows context, model, effort, branch and cost', () => {
    expect(statusLine(BASE)).toBe('ctx 42% 84k/200k  ·  opus 5.5 · high  ·  ⎇ main  ·  $1.23')
  })

  test('marks a filling context and a worktree', () => {
    expect(statusLine({ ...BASE, contextPercent: 72 })).toMatch(/^▲ ctx 72%/)
    expect(statusLine({ ...BASE, contextPercent: 91 })).toMatch(/^⚠ ctx 91%/)
    expect(statusLine({ ...BASE, isWorktree: true })).toContain('⎇ main (worktree)')
  })

  test('shows a rate-limit window only once it is half used', () => {
    const line = statusLine({ ...BASE, rateLimits: [{ kind: 'five_hour', percentUsed: 63.5 }, { kind: 'seven_day', percentUsed: 12 }] })
    expect(line).toContain('5h 64%')
    expect(line).not.toContain('7d')
  })

  test('leaves out what is unknown', () => {
    expect(statusLine({ ...BASE, contextPercent: undefined, effort: undefined, branch: undefined, costUsd: undefined })).toBe('opus 5.5')
  })
})

describe('shortModel', () => {
  test('shortens model ids and keeps aliases', () => {
    expect(shortModel('claude-opus-5-5')).toBe('opus 5.5')
    expect(shortModel('claude-sonnet-5-5[1m]')).toBe('sonnet 5.5 [1m]')
    expect(shortModel('opus')).toBe('opus')
  })
})

describe('hooks', () => {
  test('pins the line after a turn', async ($, on) => {
    let pinned: string | undefined
    on('session.usage', () => ({ value: { startedAt: 0, context: { percent: 30, tokens: 60_000, window: 200_000 }, rateLimits: [], cost: { usd: 0.5 } } }))
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.cwd', () => ({ value: '/repo' }))
    on('process.run', () => ({ value: { exitCode: 0, stdout: 'feature-x\n.git\n.git\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
    on('ui.status', ($, e) => { pinned = e.text; return { value: undefined } })
    on('turn.complete', () => ({ text: 'done' }))
    await $.turn.complete({ turnId: 't', reason: 'answer', answer: 'done', durationMs: 1, isAborted: false })
    expect(pinned).toBe('ctx 30% 60k/200k  ·  opus 5.5  ·  ⎇ feature-x  ·  $0.50')
  })
})
