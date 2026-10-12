// Builds the status line from plain figures. Pure, so the tests read it.

export type Figures = {
  contextPercent: number | undefined
  contextTokens: number | undefined
  contextWindow: number
  model: string
  effort: string | undefined
  branch: string | undefined
  isWorktree: boolean
  rateLimits: readonly { kind: string; percentUsed: number }[]
  costUsd: number | undefined
}

// Where the fill starts to deserve a look, and where a /compact pays off.
export const WARN_AT = 70
export const COMPACT_AT = 85

const WINDOWS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

export function statusLine(figures: Figures): string {
  const parts: string[] = []

  if (figures.contextPercent !== undefined) {
    const mark = figures.contextPercent >= COMPACT_AT ? '⚠ ' : figures.contextPercent >= WARN_AT ? '▲ ' : ''
    const tokens = figures.contextTokens === undefined ? '' : ` ${kilo(figures.contextTokens)}/${kilo(figures.contextWindow)}`
    parts.push(`${mark}ctx ${Math.round(figures.contextPercent)}%${tokens}`)
  }

  parts.push(figures.effort === undefined ? figures.model : `${figures.model} · ${figures.effort}`)

  if (figures.branch !== undefined) {
    parts.push(`⎇ ${figures.branch}${figures.isWorktree ? ' (worktree)' : ''}`)
  }

  // Only windows worth watching: a quiet window is noise.
  for (const limit of figures.rateLimits) {
    if (limit.percentUsed >= 50) parts.push(`${WINDOWS[limit.kind] ?? limit.kind} ${Math.round(limit.percentUsed)}%`)
  }

  if (figures.costUsd !== undefined && figures.costUsd >= 0.01) parts.push(`$${figures.costUsd.toFixed(2)}`)

  return parts.join('  ·  ')
}

export function kilo(tokens: number): string {
  return tokens >= 1_000_000
    ? `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`
    : `${Math.round(tokens / 1000)}k`
}

// "claude-opus-5-5[1m]" -> "opus 5.5 [1m]"; aliases ("opus") stay as they are.
export function shortModel(model: string): string {
  const match = /^claude-([a-z]+)-(\d+)-(\d+)(?:-\d{8})?(\[[^\]]+\])?$/.exec(model)
  return match ? `${match[1]} ${match[2]}.${match[3]}${match[4] ? ` ${match[4]}` : ''}` : model
}
