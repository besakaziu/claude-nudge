import { expect, mock, test } from 'claude-code/testing'

// Drives one `/fresh-chat` offer through to the dialog it opens (the
// AskUserQuestion tool.call $.ui.ask makes), without resolving it further:
// the mocked answer is always "Keep going here", so the offer ends there and
// never reaches the follow-up note-writing or clearing flow.
async function dialog(
  $: any,
  on: any,
  { percent, modelText }: { percent: number; modelText?: string },
) {
  mock.clock(on)

  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'fresh-chat' } }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 100000, percent }, rateLimits: [] },
  }))
  on('session.surface', () => ({ value: 'terminal' }))
  on('session.messages', () => ({ value: [] }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  if (modelText !== undefined) {
    on('model.complete', () => ({
      value: {
        isAnswered: true,
        text: modelText,
        usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }))
  }

  let asked: { question: string; options: { label: string }[] } | undefined
  let resolveAsked: () => void
  const waited = new Promise<void>(resolve => { resolveAsked = resolve })
  on('tool.call', { tool: 'AskUserQuestion' }, ($: any, e: any) => {
    asked = e.questions[0]
    resolveAsked()
    return { result: { questions: e.questions, answers: { [e.questions[0].question]: 'Keep going here' } } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'fresh-chat' })
  await waited
  return asked!
}

test('below 40%, there is plenty of room and no model is asked', async ($, on) => {
  const asked = await dialog($, on, { percent: 20 })
  expect(asked.question).toMatch(/plenty of room/)
  expect(asked.options.map(o => o.label)).toEqual([
    'Continue in a new chat', 'Compact this chat', 'Add to handover list', 'Keep going here',
  ])
})

test('between 40% and the configured ask line, it points to the next break', { options: { firstAskAt: 80, recommend: false } }, async ($, on) => {
  // firstAskAt moved to 80: the default 75% used here falls in the
  // "40-69%-equivalent" band relative to that line, proving the option took.
  const asked = await dialog($, on, { percent: 75 })
  expect(asked.question).toMatch(/next natural break/)
})

test('past the ask line, memory is getting fuzzy', { options: { recommend: false } }, async ($, on) => {
  const asked = await dialog($, on, { percent: 75 })
  expect(asked.question).toMatch(/getting fuzzy/)
})

test('a NEW verdict is listed first and marked recommended', async ($, on) => {
  const asked = await dialog($, on, { percent: 75, modelText: 'NEW\nthe task just finished' })
  expect(asked.options.map(o => o.label)).toEqual([
    'Continue in a new chat (Recommended)', 'Compact this chat', 'Add to handover list', 'Keep going here',
  ])
})

test('a COMPACT verdict is listed first and marked recommended', async ($, on) => {
  const asked = await dialog($, on, { percent: 75, modelText: 'COMPACT\nstill mid-task' })
  expect(asked.options.map(o => o.label)).toEqual([
    'Compact this chat (Recommended)', 'Continue in a new chat', 'Add to handover list', 'Keep going here',
  ])
})

test('a garbled verdict falls back to no recommendation, default order', async ($, on) => {
  const asked = await dialog($, on, { percent: 75, modelText: 'banana' })
  expect(asked.options.map(o => o.label)).toEqual([
    'Continue in a new chat', 'Compact this chat', 'Add to handover list', 'Keep going here',
  ])
})

test('recommend: false skips the model call entirely, even past 40%', { options: { recommend: false } }, async ($, on) => {
  const asked = await dialog($, on, { percent: 75 })
  expect(asked.options.map(o => o.label)).toEqual([
    'Continue in a new chat', 'Compact this chat', 'Add to handover list', 'Keep going here',
  ])
})

// Drives one resume/fork through the `classic.SessionStart` cache-expiry
// path. `prefText` stands in for the file `readCachePref` would read (absent
// means no file yet, as if it never ran before); `answer`, when given, is
// what the AskUserQuestion dialog is answered with. The chain this fires is
// "fire and forget" from `next(e)`'s point of view (see register.ts), so
// there is no promise to await here either: draining real macrotask turns
// (not just microtasks: the mocked AskUserQuestion answer resolves one tick
// late) lets every mocked call's own chain of `await`s settle before this
// returns.
async function cacheExpiry(
  $: any,
  on: any,
  { prefText, answer, compactFails, toasts, statuses }: {
    prefText?: string
    answer?: string
    // When true, nothing answers `command.run { command: 'compact' }`, the
    // same shape a genuine failure to run it takes: compactForCacheExpiry's
    // catch is what is under test, not the exact text of any one failure.
    compactFails?: boolean
    toasts?: string[]
    statuses?: (string | undefined)[]
  } = {},
) {
  on('classic.SessionStart', () => ({}))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'fresh-chat' } }))
  on('ui.toast', (_: any, e: any) => { toasts?.push(e.text); return { value: undefined } })
  on('ui.status', (_: any, e: any) => { statuses?.push(e.text); return { value: undefined } })

  on('fs.read', () => {
    if (prefText === undefined) throw new Error('ENOENT')
    return { value: prefText }
  })
  let written: string | undefined
  on('fs.write', (_: any, e: any) => { written = e.text; return { value: undefined } })

  let compacted = false
  if (!compactFails) {
    on('command.run', { command: 'compact' }, () => {
      compacted = true
      return { text: '' }
    })
  }

  let asked: { question: string; options: { label: string }[] } | undefined
  on('tool.call', { tool: 'AskUserQuestion' }, ($: any, e: any) => {
    asked = e.questions[0]
    const chosen = answer ?? 'Not this time'
    return { result: { questions: e.questions, answers: { [e.questions[0].question]: chosen } } }
  })

  const clock = mock.clock(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.classic.SessionStart({ source: 'resume', context_tokens: 95000, estimated_cache_write_usd: 0.36, prompt_cache_likely_expired: true })
  for (let i = 0; i < 50; i++) await new Promise(resolve => setTimeout(resolve, 0))
  // Clears compactForCacheExpiry's "Compacted." status 3s after success.
  await clock.advance(3000)
  for (let i = 0; i < 20; i++) await new Promise(resolve => setTimeout(resolve, 0))
  return { asked, written, compacted }
}

test('an expired cache asks by default, with the token and cost estimate', async ($, on) => {
  const { asked } = await cacheExpiry($, on, { answer: 'Not this time' })
  expect(asked!.question).toMatch(/95k tokens/)
  expect(asked!.question).toMatch(/\$0\.36/)
  expect(asked!.options.map(o => o.label)).toEqual([
    'Compact now', 'Not this time', "Always, don't ask again", 'Never, turn this off',
  ])
})

test('"Not this time" compacts nothing and remembers nothing', async ($, on) => {
  const { written, compacted } = await cacheExpiry($, on, { answer: 'Not this time' })
  expect(compacted).toBe(false)
  expect(written).toBe(undefined)
})

test('"Compact now" compacts without changing the remembered preference', async ($, on) => {
  const { written, compacted } = await cacheExpiry($, on, { answer: 'Compact now' })
  expect(compacted).toBe(true)
  expect(written).toBe(undefined)
})

test('"Always" compacts now and remembers auto for next time', async ($, on) => {
  const { written, compacted } = await cacheExpiry($, on, { answer: "Always, don't ask again" })
  expect(compacted).toBe(true)
  expect(JSON.parse(written!)).toEqual({ mode: 'auto' })
})

test('"Never" compacts nothing and remembers off for next time', async ($, on) => {
  const { written, compacted } = await cacheExpiry($, on, { answer: 'Never, turn this off' })
  expect(compacted).toBe(false)
  expect(JSON.parse(written!)).toEqual({ mode: 'off' })
})

test('a remembered "auto" preference compacts without asking again', async ($, on) => {
  const { asked, compacted } = await cacheExpiry($, on, { prefText: JSON.stringify({ mode: 'auto' }) })
  expect(asked).toBe(undefined)
  expect(compacted).toBe(true)
})

test('a remembered "off" preference does nothing at all', async ($, on) => {
  const { asked, compacted } = await cacheExpiry($, on, { prefText: JSON.stringify({ mode: 'off' }) })
  expect(asked).toBe(undefined)
  expect(compacted).toBe(false)
})

test('cacheExpiryAuto compacts without asking when nothing is remembered yet', { options: { cacheExpiryAuto: true } }, async ($, on) => {
  const { asked, compacted } = await cacheExpiry($, on, {})
  expect(asked).toBe(undefined)
  expect(compacted).toBe(true)
})

// $.session.compact() is not callable from classic.SessionStart's background
// task (confirmed in practice: the engine itself answers "not available in a
// headless (-p / SDK) session yet"), so compaction here runs the built-in
// /compact command instead, the same way clearAndResume runs /clear.
test('"Compact now" runs the /compact command rather than calling session.compact directly', async ($, on) => {
  const { compacted, written } = await cacheExpiry($, on, { answer: 'Compact now' })
  expect(compacted).toBe(true)
  expect(written).toBe(undefined)
})

// A timed toast could vanish before the /compact turn it was promising ever
// shows up (compacting can take longer than any reasonable toast timeout),
// which reads as nothing happening. A pinned status line covers the whole
// wait instead: set before the call, replaced with a confirmation once it
// resolves, then cleared a few seconds later rather than left on screen.
test('"Compact now" pins a status line for the wait and clears it once done', async ($, on) => {
  const statuses: (string | undefined)[] = []
  await cacheExpiry($, on, { answer: 'Compact now', statuses })
  expect(statuses).toEqual(['Compacting this chat, please wait…', 'Compacted.', undefined])
})

test('a /compact that fails reports why instead of leaving it silent', async ($, on) => {
  const toasts: string[] = []
  const statuses: (string | undefined)[] = []
  const { compacted } = await cacheExpiry($, on, { answer: "Always, don't ask again", compactFails: true, toasts, statuses })
  expect(compacted).toBe(false)
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/^Could not compact \(.+\)\. Type \/compact to do it yourself\.$/)
  // The wait status is taken down on failure too: nothing is left implying
  // it might still be working.
  expect(statuses).toEqual(['Compacting this chat, please wait…', undefined])
})
