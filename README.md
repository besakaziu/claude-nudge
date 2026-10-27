# claude-nudge

A Claude Code mod that notices when a chat is filling up and helps you move on at a good
moment: continue in a fresh chat from a written handoff note, compact, or park the open work
for later. You choose; it explains why.

## Why

Claude rereads the whole chat on every reply. The fuller the chat, the less sharply it
recalls what happened early on, and the more every reply costs. When the chat is nearly
full, Claude Code compacts it on its own: it replaces the older part with a summary,
without asking, at whatever moment that happens to be.

This mod steps in earlier and lets you pick the moment, ideally right after a task is finished.

## How it works

**By itself.** After each of Claude's replies, the mod checks how full the chat is. That
check is local and costs nothing. Below 70% nothing happens. At 70% you get a dialog. If
you choose "Keep going here", it asks again 10 points later (80%, then 90%), never after
every reply.

**When you ask.** Type `/fresh-chat` at any time to see where the chat stands and what to do.

When the dialog comes up:

1. A line appears right away: *Checking this chat (N% used)…*. The first time in a chat it
   also explains context in a few sentences, so the short wait is reading time.
2. From 40% on, a small model (Haiku) reads the last 12 messages, each cut short, and
   suggests whether to keep going, start a new chat or compact. That typically costs a few
   thousand tokens, and a line shows the exact number. Below 40% no call is made: there is
   plenty of room, and only you know whether you are about to switch topics.
3. The dialog shows advice for how full the chat is, when Claude Code would compact by
   itself, and the suggestion, listed first and marked "(Recommended)".

## The choices

| Choice | What happens |
|---|---|
| **Continue in a new tab** (VS Code) | Claude writes a handoff note: the goal, what is done, the current state, decisions and the next step. A new chat tab opens with "read the note and continue" in its box; press Enter. The old chat stays open, so you can still read it. |
| **Continue in a new chat** (terminal) | Same note, then the chat is cleared and continues from it. The old chat can be brought back with `/resume`. |
| **Compact this chat** | The same as `/compact`: the chat carries on with its older part summarised. |
| **Add to handover list** | Claude adds the open work to the project's handover or TODO file, if it has one, or to a new note, so you can pick it up another day. |
| **Keep going here** | Nothing changes. It asks again 10 points later. |

Rules of thumb: start a new chat right after finishing a task, even at 30%. Compact when you
are in the middle of a task and the recent details still matter. Avoid starting fresh in
the middle of something just because of the percentage.

## Resuming after a long idle

Resuming or forking a chat that has sat idle long enough for its prompt cache to expire (the
"the prompt cache has likely expired" notice) means your next message re-caches the whole
thing, at full price. This mod offers to compact right then, before you send anything, so the
re-cache that follows is small instead.

By default it asks, with the token count and estimated cost in the question, and two extra
options beyond "Compact now" and "Not this time":

- **"Always, don't ask again"** compacts now and remembers to do so automatically from then on.
- **"Never, turn this off"** remembers to leave this chat alone from then on.

Both are remembered in a small file next to the mod itself (not in `userConfig`, which a mod
cannot rewrite on its own), so the choice sticks across every project and session on this
machine until you pick differently or delete that file.

This compact runs the same `/compact` command you would type yourself, because the API a
plugin would otherwise call directly is not available this early in a resume. You will see it
as its own "/compact" turn, credited to this plugin, and it takes a few seconds to appear, the
same as typing it does. A status line under the prompt says "Compacting this chat, please
wait…" for that whole wait (not a toast that could time out first) and switches to "Compacted."
once that turn lands, clearing itself a few seconds later. If it fails for any reason, the
status line clears and a toast names the reason instead, rather than leaving the chat full
without saying why.

## Settings

Change these from Claude Code's `/config` menu, under this plugin's name:

| Setting | Default | What it does |
|---|---|---|
| Ask at (%) | 70 | How full the chat must be (percent of its context window) before the mod first asks what to do. |
| Ask again every (%) | 10 | How many more percentage points to wait before asking again after "Keep going here". |
| Recommend a choice | On | Whether to ask Haiku for a recommendation each time, from 40% on (see Privacy and cost below). Turn it off to skip that call and its tokens; you still get the dialog and the advice text, just no suggestion. |
| Auto-compact on cache expiry | Off | Skip the idle/cache-expiry dialog above and just compact. The dialog's own "Always" and "Never" buttons change this behaviour too, remembered separately (see Resuming after a long idle above); whichever was chosen more recently wins. |

## Notes

Each handoff gets its own file in `.claude/handoffs/` (for example
`.claude/handoffs/2026-10-26-1432-k3f9.md`), so two chats never overwrite each other's notes
and you keep a history you can reread. A note can quote anything from the chat, so it should
never be committed: if `.claude/handoffs/` is not git-ignored in your project, Claude tells
you and leaves `.gitignore` for you to change.

## Privacy and cost

- The suggestion sends an excerpt of the chat's last 12 messages to Haiku, through your own
  Claude account, like any other request Claude Code makes. Nothing goes anywhere else.
- Notes stay on your machine, in your project folder.
- What costs tokens: the suggestion (a few thousand tokens, from 40% on), writing the note
  (about one normal reply), and the new chat's start. Moving to a fresh chat usually pays
  for itself within a few replies, because each reply in a full chat rereads all of it.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install nudge --marketplace besakaziu/claude-nudge
```

From a shell:

```
claude plugin install nudge --marketplace besakaziu/claude-nudge
```

## Platforms

- **The new tab** (VS Code only) opens through the editor's own URI handler: `rundll32.exe` on
  Windows, `open` on macOS, `xdg-open` on Linux. The first time, VS Code asks whether the
  Claude extension may open the link; tick "Do not ask me again" to skip that from then on.
  **Windows is tested end to end. macOS and Linux follow the same approach but have not been
  run as the mod itself.** If a tab does not open there, the clipboard fallback below still
  works, so the handoff itself is never blocked.
- **The clipboard fallback**, used whenever no tab can be opened (not VS Code, or opening one
  failed): `clip.exe` on Windows, `pbcopy` on macOS, `wl-copy` or `xclip` on Linux (Wayland
  tried first, then X11). A message tells you to paste the resume prompt into a new chat.
- Everything else (the dialog, the suggestion, compacting, the notes) works wherever Claude
  Code runs.

## Contributing

Issues and pull requests are welcome.

To run a cloned copy without installing it, point Claude Code at the folder for one session:

```
claude --plugin-dir /path/to/claude-nudge
```

or set `CLAUDE_CODE_PLUGIN_DIRS` the same way in your shell, or in `~/.claude/settings.json`'s
`env` block, to load it every session; an interactive session then reloads it on every save.
Before sending a change:

```
claude plugin validate .
claude plugin test .
```

Once the mod has loaded at least once, it writes its own `.claude-plugin/types/`, and
`tsc -p .` type-checks it against the engine's API from that folder.

## Known limits

- The mod API (function hooks) is early access and may change between Claude Code releases.
- The VS Code `/open` URI handler, and the `ELECTRON_RUN_AS_NODE` workaround the new tab needs
  to start a real process rather than a no-op Node one, are undocumented editor behaviour, not
  a stable interface. A future VS Code or extension update could change or break either.
- Tested on Windows only (see Platforms above); macOS and Linux use the same reasoning but are
  unverified.
- The cache-expiry offer only fires on resuming or forking a chat; a brand new chat or `/clear`
  has nothing to expire. The idle time and the token/cost estimate come from Claude Code itself
  and are not independently checked by this mod.

## Licence

MIT
