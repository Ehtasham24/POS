# CLAUDE.md

Standing instructions for Claude Code in this repository (ExpressBackend +
clientSide React POS system). Follow these on every task, not just when
reminded.

## 1. Keep the code DRY, refactored, and optimized

- Before writing new code, check whether an existing utility/service/component
  already does it (or close to it) and reuse it instead of duplicating logic.
  This codebase has established shared patterns — follow them instead of
  inventing new ones:
  - Frontend API calls go through `src/utils/api.js`.
  - Backend multi-step writes use `pool.connect()` + `BEGIN`/`COMMIT`/`ROLLBACK`,
    with `SELECT ... FOR UPDATE` row-locking where two requests could race.
  - Backend errors go through `ApiError`, not raw `throw`/`res.status()`.
  - Balances/totals are derived via SQL views or `SUM()` queries, never
    cached or stored as a mutable column.
  - i18n strings go through `src/i18n/translations.js` + `useLanguage()`/`t()`,
    both English and Urdu.
- When you touch a file and notice duplicated logic, dead code, or an
  unnecessarily complex implementation nearby, clean it up as part of the
  change. Don't leave code worse than you found it — but don't go rewrite
  unrelated files unprompted either.
- Prefer simple, direct solutions over clever ones. Optimize for readability
  first; optimize for performance where it's actually load-bearing (DB
  schema, indices, avoiding N+1 queries). This system is meant to go to
  production on Postgres/Supabase, so schema changes should be normalized and
  properly indexed from the start, not "fixed later."
- For non-trivial changes, run `/code-review` or `/simplify` before
  considering the work done, if there's time to.

## 2. Never add a Claude co-author trailer to commits

Do not add `Co-Authored-By: Claude ...` (or any Anthropic/Claude attribution)
to any commit message in this repository, ever. The user doesn't want Claude
showing up in the GitHub contributors list. This applies to every commit,
no exceptions.

## 3. Push completed work without waiting to be asked

Once a feature or fix is implemented and verified working (build passes,
manual/API verification done) and committed, push it to `origin/main` (or
the relevant branch) as part of finishing the task. Don't leave finished,
verified work sitting only in a local commit — the expected flow is
build → verify → commit → push.
