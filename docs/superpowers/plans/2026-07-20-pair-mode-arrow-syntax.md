# Pair-Mode UX Rework (Arrow Syntax) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-textarea pair mode (PR #12) with arrow syntax (`/a -> /b`) in the single slugs textarea, and fold in the six minor review findings from PR #12 (issue #22, option A).

**Architecture:** All pairing logic lives in `src/lib/slugs.ts` as pure, unit-tested functions (`parseSlugLines`, `mergeSlugPairs`, `validateSlugs`). `CompareForm.tsx` becomes a thin consumer: one textarea, live per-line validation hint, no mode checkbox. The `slugPairs` data model, API payloads, runner, and storage from PR #12 are unchanged — when every parsed line is a shared slug the form sends the legacy `{ slugs }` payload, otherwise `{ slugPairs }`.

**Tech Stack:** Next.js (App Router), React, TypeScript, Vitest (node environment — lib tests only, no component tests), Tailwind, Prettier.

**Branch:** `feat/pair-mode-ux`, stacked on PR #12 head (`feat/per-env-slug-pairs`, unmerged, from fork). Do not merge or rebase #12 as part of this work.

## Global Constraints

- Shared slugs remain the default with zero extra input (plain lines, no arrow, no checkbox).
- Pairing must survive editing: pairing is per-line (`a -> b` on one line), never positional across fields.
- Existing runs and current API payloads keep working: `{ slugs }`, `{ slugPairs }`, legacy runs without either field, and `Run Again` URLs with `slugs`/`slugsB` params must all still work.
- Arrow token is `->` exactly. No `=>` support (YAGNI).
- Component files (`CompareForm`, `ResultsGrid`, `DiffViewer`, pages) have no test harness — verify via `npm test`, `npx tsc --noEmit`, and `npm run build`.
- Conventional commit messages. No co-author lines, no "Generated with" footers.
- Run `npx prettier --write` on touched files before each commit.

---

### Task 1: `parseSlugLines` — arrow-syntax parser

**Files:**
- Modify: `src/lib/slugs.ts`
- Test: `src/lib/slugs.test.ts`

**Interfaces:**
- Consumes: `SlugPair` from `./types` (`{ a: string; b: string }`).
- Produces:
  ```ts
  export interface SlugLineError { line: number; message: string }
  export interface ParsedSlugLines { pairs: SlugPair[]; errors: SlugLineError[] }
  export function parseSlugLines(text: string): ParsedSlugLines
  ```
  Tasks 2 and 5 rely on these exact names. `line` is 1-indexed. A line that errors contributes no pair. Empty input → `{ pairs: [], errors: [] }` (the form, not the parser, decides "enter at least one page").

**Parsing rules (one line at a time, after trim):**
1. Blank line → skipped.
2. No `->` → shared slug: `{ a: line, b: line }`.
3. Exactly one `->` → `{ a: left, b: right }`, both sides trimmed; empty side → error.
4. Two or more `->` → error.
5. Either side matching `/^https?:\/\//i` → error (absolute URLs would silently ignore the Base URLs).
6. Duplicate A-slug (vs any earlier line) → error.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/slugs.test.ts` (add `parseSlugLines` to the import from `./slugs`):

```ts
describe('parseSlugLines', () => {
  it('treats plain lines as shared slugs', () => {
    expect(parseSlugLines('/\n/about')).toEqual({
      pairs: [
        { a: '/', b: '/' },
        { a: '/about', b: '/about' },
      ],
      errors: [],
    })
  })

  it('parses arrow lines into pairs and trims both sides', () => {
    expect(parseSlugLines('/de/uber-uns ->  /en/about-us ')).toEqual({
      pairs: [{ a: '/de/uber-uns', b: '/en/about-us' }],
      errors: [],
    })
  })

  it('mixes shared and paired lines', () => {
    expect(parseSlugLines('/\n/about -> /about-us').pairs).toEqual([
      { a: '/', b: '/' },
      { a: '/about', b: '/about-us' },
    ])
  })

  it('skips blank lines without shifting pairing or line numbers', () => {
    const result = parseSlugLines('/a\n\n/b -> \n/c')
    expect(result.pairs).toEqual([
      { a: '/a', b: '/a' },
      { a: '/c', b: '/c' },
    ])
    expect(result.errors).toEqual([
      { line: 3, message: expect.stringContaining('after "->"') },
    ])
  })

  it('errors on a missing side of an arrow', () => {
    expect(parseSlugLines('-> /b').errors).toEqual([
      { line: 1, message: expect.stringContaining('before "->"') },
    ])
  })

  it('errors on more than one arrow in a line', () => {
    const { pairs, errors } = parseSlugLines('/a -> /b -> /c')
    expect(pairs).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0].line).toBe(1)
  })

  it('errors on absolute URLs on either side', () => {
    expect(parseSlugLines('https://x.com/a').errors).toHaveLength(1)
    expect(parseSlugLines('/a -> http://x.com/b').errors).toHaveLength(1)
  })

  it('errors on duplicate A-slugs, keeping the first pair', () => {
    const { pairs, errors } = parseSlugLines('/a -> /x\n/a -> /y')
    expect(pairs).toEqual([{ a: '/a', b: '/x' }])
    expect(errors).toEqual([
      { line: 2, message: expect.stringContaining('"/a"') },
    ])
  })

  it('returns empty pairs and no errors for empty input', () => {
    expect(parseSlugLines('')).toEqual({ pairs: [], errors: [] })
    expect(parseSlugLines('\n  \n')).toEqual({ pairs: [], errors: [] })
  })

  it('collects multiple errors with correct line numbers', () => {
    const { errors } = parseSlugLines('/a\n-> /b\n/c ->')
    expect(errors.map((e) => e.line)).toEqual([2, 3])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- slugs`
Expected: FAIL — `parseSlugLines` is not exported.

- [ ] **Step 3: Implement `parseSlugLines`**

Add to `src/lib/slugs.ts`:

```ts
export interface SlugLineError {
  line: number
  message: string
}

export interface ParsedSlugLines {
  pairs: SlugPair[]
  errors: SlugLineError[]
}

const ARROW = '->'

function isAbsoluteUrl(slug: string): boolean {
  return /^https?:\/\//i.test(slug)
}

/**
 * Parse the slugs textarea. One page per line: a plain line is a shared slug,
 * `a -> b` pairs different slugs per environment. Pairing is per-line, so
 * editing one line never shifts the pairing of the others. Error lines are
 * reported individually and contribute no pair.
 */
export function parseSlugLines(text: string): ParsedSlugLines {
  const pairs: SlugPair[] = []
  const errors: SlugLineError[] = []
  const seenA = new Set<string>()

  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const lineNo = i + 1
    if (!line) continue

    const parts = line.split(ARROW).map((part) => part.trim())
    if (parts.length > 2) {
      errors.push({ line: lineNo, message: `more than one "${ARROW}"` })
      continue
    }
    const [a, b] = parts.length === 2 ? parts : [parts[0], parts[0]]
    if (!a || !b) {
      errors.push({
        line: lineNo,
        message: `missing slug ${a ? 'after' : 'before'} "${ARROW}"`,
      })
      continue
    }
    if (isAbsoluteUrl(a) || isAbsoluteUrl(b)) {
      errors.push({
        line: lineNo,
        message: 'use a path like /about — the Base URLs provide the host',
      })
      continue
    }
    if (seenA.has(a)) {
      errors.push({ line: lineNo, message: `duplicate slug "${a}"` })
      continue
    }
    seenA.add(a)
    pairs.push({ a, b })
  }

  return { pairs, errors }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- slugs`
Expected: PASS (all new `parseSlugLines` tests; existing tests untouched).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/slugs.ts src/lib/slugs.test.ts
git add src/lib/slugs.ts src/lib/slugs.test.ts
git commit -m "feat: add arrow-syntax slug line parser"
```

---

### Task 2: `mergeSlugPairs` — merge sitemap-selected slugs with parsed pairs

**Files:**
- Modify: `src/lib/slugs.ts`
- Test: `src/lib/slugs.test.ts`

**Interfaces:**
- Consumes: `SlugPair`, plus `parseSlugLines` output from Task 1 (the `typed` argument is `parsed.pairs`).
- Produces:
  ```ts
  export function mergeSlugPairs(
    selected: Iterable<string>,
    typed: SlugPair[],
  ): SlugPair[]
  ```
  Task 5 relies on this exact signature. Semantics mirror the existing `mergeSlugs` (selected first, then typed-only, first-seen dedupe) with one addition: a typed pair whose A-slug is also sitemap-selected overrides the selected entry's B-slug in place (an explicit mapping beats the implicit shared one).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/slugs.test.ts` (add `mergeSlugPairs` to the import):

```ts
describe('mergeSlugPairs', () => {
  const shared = (s: string) => ({ a: s, b: s })

  it('unions selected slugs (as shared pairs) with typed pairs', () => {
    expect(mergeSlugPairs(['/a'], [{ a: '/b', b: '/x' }])).toEqual([
      shared('/a'),
      { a: '/b', b: '/x' },
    ])
  })

  it('lets a typed mapping override a selected shared slug in place', () => {
    expect(
      mergeSlugPairs(['/a', '/b'], [{ a: '/a', b: '/staging-a' }]),
    ).toEqual([{ a: '/a', b: '/staging-a' }, shared('/b')])
  })

  it('dedupes selected slugs and trims them', () => {
    expect(mergeSlugPairs([' /a ', '/a'], [])).toEqual([shared('/a')])
  })

  it('handles empty selection (typed only)', () => {
    expect(mergeSlugPairs([], [shared('/x')])).toEqual([shared('/x')])
  })

  it('handles empty typed pairs (selection only)', () => {
    expect(mergeSlugPairs(['/x'], [])).toEqual([shared('/x')])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- slugs`
Expected: FAIL — `mergeSlugPairs` is not exported.

- [ ] **Step 3: Implement `mergeSlugPairs`**

Add to `src/lib/slugs.ts`:

```ts
/**
 * Merge checklist-selected slugs (implicitly shared) with pairs typed in the
 * textarea. Selected slugs come first in first-seen order, like mergeSlugs; a
 * typed pair whose A-slug is also selected overrides that entry's B-slug in
 * place, because an explicit `a -> b` mapping beats the implicit shared one.
 */
export function mergeSlugPairs(
  selected: Iterable<string>,
  typed: SlugPair[],
): SlugPair[] {
  const out: SlugPair[] = []
  const indexByA = new Map<string, number>()

  for (const raw of selected) {
    const slug = raw.trim()
    if (!slug || indexByA.has(slug)) continue
    indexByA.set(slug, out.length)
    out.push({ a: slug, b: slug })
  }
  for (const pair of typed) {
    const at = indexByA.get(pair.a)
    if (at !== undefined) {
      out[at] = pair
    } else {
      indexByA.set(pair.a, out.length)
      out.push(pair)
    }
  }

  return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- slugs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/slugs.ts src/lib/slugs.test.ts
git add src/lib/slugs.ts src/lib/slugs.test.ts
git commit -m "feat: merge sitemap-selected slugs with typed slug pairs"
```

---

### Task 3: API-side validation — `validateSlugs` + reject absolute URLs in `validateSlugPairs`

**Files:**
- Modify: `src/lib/slugs.ts`
- Test: `src/lib/slugs.test.ts`

**Interfaces:**
- Consumes: existing `collectPairs` helper and `PairMessages` interface in `src/lib/slugs.ts`.
- Produces:
  ```ts
  export type SlugsResult =
    | { ok: true; slugs: string[] }
    | { ok: false; error: string }
  export function validateSlugs(input: unknown): SlugsResult
  ```
  and `validateSlugPairs` additionally rejects absolute URLs. Task 4 relies on both. To wire the absolute-URL check into the shared core, extend `PairMessages` with `absolute: (index: number, slug: string) => string` and add this check inside `collectPairs`'s loop, after the missing-side check:
  ```ts
  if (isAbsoluteUrl(a) || isAbsoluteUrl(b)) {
    return {
      ok: false,
      error: messages.absolute(i, isAbsoluteUrl(a) ? a : b),
    }
  }
  ```
  (`zipSlugPairs` also calls `collectPairs`; give it an `absolute` message too — it is deleted in Task 8, so wording there is throwaway: `(i, slug) => \`Line ${i + 1}: "${slug}" is an absolute URL — use a path\``.)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/slugs.test.ts` (add `validateSlugs` to the import):

```ts
describe('validateSlugs', () => {
  it('accepts an array of slugs, trimming and deduping', () => {
    expect(validateSlugs([' /a ', '/b', '/a', ''])).toEqual({
      ok: true,
      slugs: ['/a', '/b'],
    })
  })

  it('rejects non-arrays', () => {
    expect(validateSlugs(undefined).ok).toBe(false)
    expect(validateSlugs('nope').ok).toBe(false)
    expect(validateSlugs({ 0: '/a' }).ok).toBe(false)
  })

  it('rejects arrays containing non-strings', () => {
    expect(validateSlugs(['/a', 42]).ok).toBe(false)
  })

  it('rejects arrays with no non-empty slugs', () => {
    expect(validateSlugs([]).ok).toBe(false)
    expect(validateSlugs(['  ', '']).ok).toBe(false)
  })
})
```

And in the existing `validateSlugPairs` describe block:

```ts
  it('rejects absolute URLs on either side', () => {
    expect(validateSlugPairs([{ a: 'https://x.com/a', b: '/b' }]).ok).toBe(
      false,
    )
    expect(validateSlugPairs([{ a: '/a', b: 'http://x.com/b' }]).ok).toBe(
      false,
    )
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- slugs`
Expected: FAIL — `validateSlugs` not exported; absolute-URL pairs currently accepted.

- [ ] **Step 3: Implement**

In `src/lib/slugs.ts`:

1. Extend `PairMessages` and `collectPairs` as described in the Interfaces block above.
2. Add the `absolute` message to `zipSlugPairs` and `validateSlugPairs`'s message objects. For `validateSlugPairs`:
   ```ts
   absolute: (i, slug) =>
     `slugPairs[${i}]: "${slug}" is an absolute URL — use a path, the base URLs provide the host`,
   ```
3. Add:
   ```ts
   export type SlugsResult =
     | { ok: true; slugs: string[] }
     | { ok: false; error: string }

   /** Validate an untrusted `slugs` API payload: an array of strings with at
    * least one non-empty entry. Trims and dedupes, preserving order. */
   export function validateSlugs(input: unknown): SlugsResult {
     if (!Array.isArray(input)) {
       return { ok: false, error: 'slugs must be an array of strings' }
     }
     const seen = new Set<string>()
     const slugs: string[] = []
     for (const entry of input) {
       if (typeof entry !== 'string') {
         return { ok: false, error: 'slugs must be an array of strings' }
       }
       const slug = entry.trim()
       if (!slug || seen.has(slug)) continue
       seen.add(slug)
       slugs.push(slug)
     }
     if (!slugs.length) {
       return { ok: false, error: 'slugs must contain at least one non-empty slug' }
     }
     return { ok: true, slugs }
   }
   ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- slugs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/slugs.ts src/lib/slugs.test.ts
git add src/lib/slugs.ts src/lib/slugs.test.ts
git commit -m "feat: validate slugs payload and reject absolute-URL slugs"
```

---

### Task 4: Use `validateSlugs` in the compare API route

**Files:**
- Modify: `src/app/api/compare/route.ts:14-32`

**Interfaces:**
- Consumes: `validateSlugs`, `validateSlugPairs` from `@/lib/slugs` (Task 3).
- Produces: no new interfaces. Request/response contract unchanged for valid payloads; invalid `slugs` payloads now get a specific 400 instead of being cast.

- [ ] **Step 1: Replace the unchecked cast**

In `src/app/api/compare/route.ts`, replace lines 14–32 (`let slugs: string[] = body.slugs ?? []` through the missing-fields check) with:

```ts
  // Clients send either a shared slug list or per-environment slug pairs.
  // Both are validated here; `slugs` becomes the A-side identity list.
  let slugs: string[]
  let slugPairs: SlugPair[] | undefined
  if (body.slugPairs != null) {
    const validated = validateSlugPairs(body.slugPairs)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }
    slugPairs = validated.pairs
    slugs = slugPairs.map((p) => p.a)
  } else {
    const validated = validateSlugs(body.slugs)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }
    slugs = validated.slugs
  }

  if (!baseUrlA || !baseUrlB) {
    return NextResponse.json(
      { error: 'Missing required fields: baseUrlA, baseUrlB' },
      { status: 400 },
    )
  }
```

Update the import: `import { validateSlugPairs, validateSlugs } from '@/lib/slugs'`.

- [ ] **Step 2: Verify types and tests**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests PASS.

- [ ] **Step 3: Commit**

```bash
npx prettier --write src/app/api/compare/route.ts
git add src/app/api/compare/route.ts
git commit -m "fix: validate slugs payload in compare route instead of casting"
```

---

### Task 5: Rework `CompareForm` — single textarea with arrow syntax

**Files:**
- Modify: `src/components/CompareForm.tsx`

**Interfaces:**
- Consumes: `parseSlugLines`, `mergeSlugPairs` from `@/lib/slugs` (Tasks 1–2). `mergeSlugs` and `zipSlugPairs` imports are removed.
- Produces: form still POSTs to `/api/compare` with either `{ slugs: string[] }` (when every merged pair has `a === b`) or `{ slugPairs: SlugPair[] }` — no API change.

This task removes the `pairMode` checkbox and second textarea entirely. Sitemap fetch/checklist becomes unconditionally visible again.

- [ ] **Step 1: Remove pair-mode state and add migrations**

1. Delete state: `const [pairMode, setPairMode] = useState(false)` and `const [slugsTextB, setSlugsTextB] = useState('')`.
2. In `FormState`, delete `pairMode?: boolean` and `slugsTextB?: string`.
3. In the mount effect, replace the URL-param branch body with (keeps `slugsB` URLs from old runs working by converting them to arrow lines):

```ts
    if (urlA || urlB || urlSlugs.length) {
      // URL params take priority (from "Run Again")
      if (urlA) setBaseUrlA(urlA)
      if (urlB) setBaseUrlB(urlB)
      if (urlSlugsB.length && urlSlugs.length) {
        setSlugsText(
          urlSlugs
            .map((a, i) => {
              const b = urlSlugsB[i]
              return b && b !== a ? `${a} -> ${b}` : a
            })
            .join('\n'),
        )
      } else if (urlSlugs.length) {
        setSlugsText(urlSlugs.join('\n'))
      }
    }
```

4. In the localStorage branch, migrate saved pair-mode state to arrow lines (one-time; the next save drops the legacy fields):

```ts
      const saved = loadFromStorage()
      if (saved) {
        setBaseUrlA(saved.baseUrlA)
        setBaseUrlB(saved.baseUrlB)
        const legacy = saved as FormState & {
          pairMode?: boolean
          slugsTextB?: string
        }
        if (legacy.pairMode && legacy.slugsTextB) {
          const linesB = legacy.slugsTextB.split('\n')
          setSlugsText(
            saved.slugsText
              .split('\n')
              .map((rawA, i) => {
                const a = rawA.trim()
                const b = (linesB[i] ?? '').trim()
                return a && b && b !== a ? `${a} -> ${b}` : rawA
              })
              .join('\n'),
          )
        } else {
          setSlugsText(saved.slugsText)
        }
        setSitemapUrl(saved.sitemapUrl)
        setClickSelectorsText(saved.clickSelectorsText ?? '')
        if (saved.concurrency) setConcurrency(saved.concurrency)
      }
```

5. Remove `pairMode` and `slugsTextB` from the save effect's `saveToStorage` call and dependency array.

- [ ] **Step 2: Rewrite submit to use the parser**

Replace the `slugsPayload` block in `handleSubmit` with:

```ts
    const parsed = parseSlugLines(slugsText)
    if (parsed.errors.length) {
      const first = parsed.errors[0]
      setError(`Line ${first.line}: ${first.message}`)
      setLoading(false)
      return
    }
    const merged = mergeSlugPairs(selectedSlugs, parsed.pairs)
    if (!merged.length) {
      setError('Enter at least one page to compare')
      setLoading(false)
      return
    }
    const slugsPayload = merged.every((p) => p.a === p.b)
      ? { slugs: merged.map((p) => p.a) }
      : { slugPairs: merged }
```

Update imports: `import { mergeSlugPairs, parseSlugLines } from '@/lib/slugs'`.

- [ ] **Step 3: Rewrite the textarea block and live hint**

1. Delete the pair-mode checkbox `<label>` (lines 234–241 of the current file), the entire `{pairMode ? ( ... ) : ( ... )}` two-textarea conditional, and both pair-mode-only `<p>` notices (the sitemap-unavailable note and the ignored-selected-slugs warning).
2. Keep a single textarea block; unwrap the sitemap sections from their `{!pairMode && ...}` guards:

```tsx
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Pages to compare (one per line; merged with any checked below)
        </label>
        <textarea
          value={slugsText}
          onChange={(e) => setSlugsText(e.target.value)}
          rows={6}
          placeholder={'/\n/about\n/de/uber-uns -> /en/about-us'}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          Use <code className="font-mono">/a -&gt; /b</code> when a page has
          different slugs in the two environments.{' '}
          {lineErrors.length > 0 ? (
            <span className="text-amber-600">
              Line {lineErrors[0].line}: {lineErrors[0].message}
              {lineErrors.length > 1 &&
                ` (+${lineErrors.length - 1} more ${
                  lineErrors.length === 2 ? 'issue' : 'issues'
                })`}
            </span>
          ) : (
            pageCount > 0 && (
              <span>
                {pageCount} {pageCount === 1 ? 'page' : 'pages'}
                {pairedCount > 0 &&
                  ` (${pairedCount} with a different B slug)`}
              </span>
            )
          )}
        </p>
      </div>
```

3. Above the `return`, replace the `pairPreview` line with:

```ts
  // Live per-line hint driven by the same parser used on submit, so the
  // preview never disagrees with what actually happens when you run. Neutral
  // (no error styling) while the textarea is empty.
  const parsedPreview = parseSlugLines(slugsText)
  const lineErrors = parsedPreview.errors
  const pageCount = mergeSlugPairs(selectedSlugs, parsedPreview.pairs).length
  const pairedCount = parsedPreview.pairs.filter((p) => p.a !== p.b).length
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: clean. Then manual smoke test:

```bash
npm run dev
```

Check at http://localhost:3333: single textarea with no checkbox; typing `/about -> /about-us` shows "1 page (1 with a different B slug)"; typing `-> /x` shows an amber `Line 1: …` hint; empty textarea shows only the neutral syntax hint (no amber); sitemap fetch section visible.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/components/CompareForm.tsx
git add src/components/CompareForm.tsx
git commit -m "feat: replace pair-mode textareas with arrow syntax in one textarea"
```

---

### Task 6: `Run Again` legacy branch uses `getAllSlugs`

**Files:**
- Modify: `src/app/runs/[id]/page.tsx:43-50`

**Interfaces:**
- Consumes: `getAllSlugs` from `@/lib/runResults` (already exists, already tested).
- Produces: nothing new. Fixes the PR #12 finding that the legacy branch emitted only `run.results` slugs, silently dropping still-pending slugs from the rerun URL.

- [ ] **Step 1: Apply the fix**

In `src/app/runs/[id]/page.tsx`, add `getAllSlugs` to the imports:

```ts
import { getAllSlugs } from '@/lib/runResults'
```

and replace the else-branch of the rerun-params block:

```ts
  } else {
    for (const s of getAllSlugs(run)) rerunParams.append('slugs', s)
  }
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
npx prettier --write src/app/runs/[id]/page.tsx
git add src/app/runs/[id]/page.tsx
git commit -m "fix: include pending slugs in Run Again for non-pair runs"
```

---

### Task 7: Replace per-card `getSlugB` lookups with a memoized map

**Files:**
- Modify: `src/lib/runResults.ts`, `src/components/ResultsGrid.tsx`
- Test: `src/lib/runResults.test.ts`

**Interfaces:**
- Consumes: `ComparisonRun` type.
- Produces:
  ```ts
  export function getSlugBMap(run: ComparisonRun): Map<string, string>
  ```
  Returns an empty map for shared-slug/legacy runs; callers fall back with `map.get(slug) ?? slug`. `getSlugB` is removed (its only consumer was `ResultsGrid`; `DiffViewer` receives `slugB` as a prop).

- [ ] **Step 1: Write the failing tests**

In `src/lib/runResults.test.ts`, replace `getSlugB` in the import with `getSlugBMap`, and replace the first three tests of the `describe('getSlugB', ...)` block with (keep the fourth test — `keeps existing helpers returning A-slugs on a pair run` — unchanged, it doesn't use `getSlugB`):

```ts
describe('getSlugBMap', () => {
  it('maps A slugs to their paired B slugs', () => {
    const run = makeRun({
      slugs: ['/about'],
      slugPairs: [{ a: '/about', b: '/preview/de/about' }],
    })
    expect(getSlugBMap(run).get('/about')).toBe('/preview/de/about')
  })

  it('returns an empty map for shared-slug and legacy runs', () => {
    expect(getSlugBMap(makeRun({})).size).toBe(0)
  })

  it('has no entry for an A slug not in slugPairs (callers fall back)', () => {
    const run = makeRun({
      slugPairs: [{ a: '/about', b: '/preview/de/about' }],
    })
    expect(getSlugBMap(run).get('/contact')).toBeUndefined()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- runResults`
Expected: FAIL — `getSlugBMap` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/runResults.ts`, replace `getSlugB` with:

```ts
/** A-slug → B-slug lookup for pair runs. Empty for shared-slug and legacy
 * runs — callers fall back with `map.get(slug) ?? slug`. Built once per run
 * snapshot so per-card renders avoid a linear find. */
export function getSlugBMap(run: ComparisonRun): Map<string, string> {
  return new Map((run.slugPairs ?? []).map((p) => [p.a, p.b]))
}
```

In `src/components/ResultsGrid.tsx`:
1. Import `useMemo` from react; replace `getSlugB` with `getSlugBMap` in the `@/lib/runResults` import.
2. After `const [run, setRun] = useState...`, add:
   ```ts
   const slugBMap = useMemo(() => getSlugBMap(run), [run])
   ```
3. Replace both call sites: `slugB={getSlugB(run, slug)}` → `slugB={slugBMap.get(slug) ?? slug}` and `slugB={getSlugB(run, selectedSlug)}` → `slugB={slugBMap.get(selectedSlug) ?? selectedSlug}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/runResults.ts src/lib/runResults.test.ts src/components/ResultsGrid.tsx
git add src/lib/runResults.ts src/lib/runResults.test.ts src/components/ResultsGrid.tsx
git commit -m "perf: memoize A-to-B slug lookup in results grid"
```

---

### Task 8: Delete now-unused `zipSlugPairs` and `mergeSlugs`

**Files:**
- Modify: `src/lib/slugs.ts`, `src/lib/slugs.test.ts`

**Interfaces:**
- Consumes: nothing. After Task 5, `CompareForm` no longer imports `zipSlugPairs` or `mergeSlugs`; they have no other consumers (verify below). This also retires the "1 slugs" pluralization bug, which lived in `zipSlugPairs`'s count-mismatch message.
- Produces: `collectPairs` + `PairMessages` stay (still used by `validateSlugPairs`).

- [ ] **Step 1: Verify they are orphans**

Run: `grep -rn "zipSlugPairs\|mergeSlugs" src/ --include="*.ts" --include="*.tsx" | grep -v "slugs.ts\|slugs.test.ts"`
Expected: no output. If anything appears, stop — fix that consumer first.

- [ ] **Step 2: Delete**

1. In `src/lib/slugs.ts`: delete the `zipSlugPairs` function and its doc comment, and the `mergeSlugs` function and its doc comment.
2. In `src/lib/slugs.test.ts`: delete the `describe('zipSlugPairs', ...)` and `describe('mergeSlugs', ...)` blocks and remove both names from the import.

- [ ] **Step 3: Verify**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, no unused-export or type errors.

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/lib/slugs.ts src/lib/slugs.test.ts
git add src/lib/slugs.ts src/lib/slugs.test.ts
git commit -m "refactor: drop zipSlugPairs and mergeSlugs superseded by arrow parser"
```

---

### Task 9: `DiffViewer` header truncation fix

**Files:**
- Modify: `src/components/DiffViewer.tsx:139`

**Interfaces:** none — CSS-only fix. `truncate` on the `<h2>` cannot work because its parent flex item can grow past the container; `min-w-0` lets it shrink.

- [ ] **Step 1: Apply the fix**

In the header (`<div className="flex items-center justify-between p-4 border-b">`), change the first child from `<div>` to:

```tsx
          <div className="min-w-0">
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: clean. Optional visual check in dev: open a diff modal for a long slug pair; the title now truncates with an ellipsis instead of pushing the header buttons out.

- [ ] **Step 3: Commit**

```bash
npx prettier --write src/components/DiffViewer.tsx
git add src/components/DiffViewer.tsx
git commit -m "fix: allow diff viewer title to truncate with min-w-0"
```

---

### Task 10: Full verification pass

**Files:** none new.

- [ ] **Step 1: Full checks**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run format:check && npm run build`
Expected: all clean. Fix and amend into the relevant commit if not.

- [ ] **Step 2: End-to-end smoke test**

```bash
npm run dev
```

1. Shared-only run: enter two base URLs and plain slugs → run starts, results page shows cards without `B:` lines. Confirms `{ slugs }` payload path.
2. Mixed run: add `/x -> /y` line → run starts; the `/x` card shows `B: /y`; diff modal shows `/x vs /y`. Confirms `{ slugPairs }` payload path.
3. `Run Again` from the mixed run → form pre-fills with `/x -> /y` arrow line.
4. Legacy `Run Again`: open an old shared-slug run (or one mid-run) → all slugs appear in the form, including pending ones.

- [ ] **Step 3: Verify branch state**

Run: `git log feat/per-env-slug-pairs..HEAD --oneline`
Expected: exactly the commits from Tasks 1–9, nothing else.
