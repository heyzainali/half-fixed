# Real-world runs

half-fixed was run on six open source projects that keep several implementations of the same thing side by side. This page records what it found, how fast it ran, and what ten of its findings turned out to be when someone read the code. Every claim links to the exact commit and line, so you can check it.

Runs were made on 1 October 2026 with the bundled CLI (`skills/half-fixed/scripts/half-fixed.js`) on Node 18, on a laptop. The raw output of each run is in [`runs/`](runs/).

## Results

| Project | What its siblings are | Revision | Commits read | Sibling groups | High-confidence findings | Time |
|---|---|---|---:|---:|---:|---:|
| [prism-php/prism](https://github.com/prism-php/prism) | 10 LLM provider integrations | [`5d6cc65`](https://github.com/prism-php/prism/tree/5d6cc65b80b19cf3f22744703ac0c727b68cdca8) | 337 | 46 | 24 | 3 s |
| [laravel/framework](https://github.com/laravel/framework) | cache stores, database drivers, mail transports | [`5fd2184`](https://github.com/laravel/framework/tree/5fd21848a2ab1b53213cd17635b9feaaa13cbc6f) | 1,960 | 90 | 8 | 6 s |
| [django/django](https://github.com/django/django) | database backends, locales | [`80ea222`](https://github.com/django/django/tree/80ea222c8af501031b2eae4f7d9fdbf16cb507a7) | 563 | 52 | 7 | 3 s |
| [rails/rails](https://github.com/rails/rails) | associations, cache stores, database adapters | [`e168c98`](https://github.com/rails/rails/tree/e168c98ca29d524440a431c0c17c5a8ed1097e56) | 1,569 | 60 | 3 | 5 s |
| [BerriAI/litellm](https://github.com/BerriAI/litellm) | 100+ LLM providers, 50+ guardrails | [`a14af73`](https://github.com/BerriAI/litellm/tree/a14af739a48a8356963273d78900bf995704c253) | 5,000 | 326 | 62 | 59 s |
| [knex/knex](https://github.com/knex/knex) | SQL dialects | [`e25d54b`](https://github.com/knex/knex/tree/e25d54bcb707714a17f5a5744eba5c4246bb4d1d) | 27 | 2 | 0 | <1 s |

"Commits read" counts only commits that touched a sibling group. Prism was scanned with its full history. The others were cloned with history since 1 January 2023 (`--shallow-since=2023-01-01`), and litellm reached the default cap of 5,000 commits.

Knex is the counter-example: each dialect's files carry the dialect's name (`mysql-querycompiler.js`, `pg-querycompiler.js`), so half-fixed, which groups files by path, finds almost no siblings there.

## Ten findings, checked by hand

Each finding was triaged the way the [`half-fixed` skill](../../skills/half-fixed/references/triage.md) tells an agent to: read the original commit, read the sibling, and decide.

| Finding | What the original commit changed | Sibling flagged | Verdict |
|---|---|---|---|
| Prism `hf-5505660` | [`9447c71`](https://github.com/prism-php/prism/commit/9447c71d8697950ff1005f2409b95c99afcdcf84) stopped DeepSeek and OpenRouter failing on tools with no parameters | Groq, Mistral, xAI, Z ([Groq:21](https://github.com/prism-php/prism/blob/5d6cc65b80b19cf3f22744703ac0c727b68cdca8/src/Providers/Groq/Maps/ToolMap.php#L21)) | **Gap.** A parameterless tool sent `"properties": []`, which those APIs reject. Fixed in [prism-php/prism#1038](https://github.com/prism-php/prism/pull/1038). |
| Django `hf-547b49a` | [`0fcee16`](https://github.com/django/django/commit/0fcee1676c7f14bb08e2cc662898dee56d9cf207) (#35111) moved expression handling into lookups and removed the now-unused guards from the base, Oracle, and SQLite backends | MySQL ([L233](https://github.com/django/django/blob/80ea222c8af501031b2eae4f7d9fdbf16cb507a7/django/db/backends/mysql/operations.py#L233), [L252](https://github.com/django/django/blob/80ea222c8af501031b2eae4f7d9fdbf16cb507a7/django/db/backends/mysql/operations.py#L252)) | **Unfinished cleanup.** MySQL is the only backend that still has the guard. It's harmless dead code, not a bug. |
| Prism `hf-f2ef1c7` | [`873a46f`](https://github.com/prism-php/prism/commit/873a46f5c0e63fb476b4573decdd88ff75c0eb42) stopped a `null` `finish_reason` from crashing OpenRouter | DeepSeek, Mistral, Z | **Unsure.** Mistral's map already accepts `null`, and DeepSeek checks for it while streaming. Only the non-streaming DeepSeek and Z paths could fail, and their APIs document a non-null value there. |
| Laravel `hf-ad34d02` | [`52d5fb5`](https://github.com/laravel/framework/commit/52d5fb56a7b48f067c54c00eafc069dbd2e1bd0f) made Memcached locks longer than 30 days use a timestamp | [`CacheLock`:38](https://github.com/laravel/framework/blob/5fd21848a2ab1b53213cd17635b9feaaa13cbc6f/src/Illuminate/Cache/CacheLock.php#L38) | **Handled elsewhere.** `CacheLock` goes through the store's `add()`, and [`MemcachedStore::add()`](https://github.com/laravel/framework/blob/5fd21848a2ab1b53213cd17635b9feaaa13cbc6f/src/Illuminate/Cache/MemcachedStore.php#L140) already converts long TTLs. |
| Laravel `hf-8fd64cf` | [`55b9539`](https://github.com/laravel/framework/commit/55b95392812ef97fc94714fb591a670927335f9c) renamed `Tags` to `EmailTags` in the SES v2 transport | [`SesTransport`:61](https://github.com/laravel/framework/blob/5fd21848a2ab1b53213cd17635b9feaaa13cbc6f/src/Illuminate/Mail/Transport/SesTransport.php#L61) | **Intentional.** The v1 transport calls `sendRawEmail`, whose parameter really is `Tags`. |
| Laravel `hf-eb5b5c2` | [`ec51a66`](https://github.com/laravel/framework/commit/ec51a6608b02a63c80d7d7ef1b529185d0376dfc) switched mail components from `{!! !!}` to `{{ }}` | [`layout.blade.php`:43](https://github.com/laravel/framework/blob/5fd21848a2ab1b53213cd17635b9feaaa13cbc6f/src/Illuminate/Mail/resources/views/html/layout.blade.php#L43) | **No behaviour difference.** `Markdown::parse()` returns an `HtmlString`, which `{{ }}` prints unescaped, exactly as `{!! !!}` does. |
| Rails `hf-e94c86f` | [`1df1373`](https://github.com/rails/rails/commit/1df13732a9834df1fae17761b8ae3d2cbaa4253a) resolved the real class of a polymorphic `belongs_to` before destroying it asynchronously | `has_many`, `has_one` ([L49](https://github.com/rails/rails/blob/e168c98ca29d524440a431c0c17c5a8ed1097e56/activerecord/lib/active_record/associations/has_many_association.rb#L49)) | **Intentional.** Only `belongs_to` can be polymorphic. The target class of `has_many` and `has_one` is fixed, so `reflection.klass` is right there. |
| Rails `hf-d44141b` | [`84437f5`](https://github.com/rails/rails/commit/84437f5bf8e9ce7332182cdc336d886ebc4bd9cf) made `RedisCacheStore` call `FLUSHDB` and `INFO` in a way that works with `redis-client` | [`deprecated_redis_cache_store`:319](https://github.com/rails/rails/blob/e168c98ca29d524440a431c0c17c5a8ed1097e56/activesupport/lib/active_support/cache/deprecated_redis_cache_store.rb#L319) | **Intentional.** The deprecated store is built on the `redis` gem, which has `flushdb` and `info`. |
| litellm `hf-d2c4545` | [`df7b1f0`](https://github.com/BerriAI/litellm/commit/df7b1f0fce595088d740f257e3e34edab4176310) made DeepSeek forward a new list of transformed messages | groq, moonshot, and 4 more ([groq:157](https://github.com/BerriAI/litellm/blob/a14af739a48a8356963273d78900bf995704c253/litellm/llms/groq/chat/transformation.py#L157)) | **Obsolete.** Those providers modify `messages` in place, so passing `messages` is correct. |
| litellm `hf-f5c9976` (low) | [`a308a8e`](https://github.com/BerriAI/litellm/commit/a308a8e57903ecad967b94d15b4f5a88e4b49d36) passed `litellm_params.timeout` to "every HTTP guardrail" | agent_365, akto, custom_code, grayswan, tool_policy | **Intentional or handled elsewhere.** The commit message says akto was dropped on purpose, grayswan has its own `guardrail_timeout`, agent_365 and custom_code pass the timeout under other names, and tool_policy makes no HTTP calls. |

The tally: **one real gap** (now a pull request), **one unfinished cleanup**, **one unsure**, and **seven deliberate differences**, cases handled another way, or no difference in behaviour.

That ratio is the reason half-fixed is a skill and not an auto-fixer. In mature, well-reviewed projects, most differences between siblings are on purpose. The scanner's job is to turn thousands of commits into a short list worth reading. The agent's job is to read it and back every verdict with evidence.

## What these runs changed in half-fixed

Running on real projects exposed three weaknesses in the scanner. All three were fixed before this page was written, and the numbers above come from the fixed version.

1. **Tooling commits counted as fixes.** litellm has commits like `fix(lint): ...` that only change type annotations. Commits about lint, types, or formatting no longer count as fixes. This cut litellm's high-confidence findings from 77 to 64.
2. **Lines already present elsewhere.** The first litellm run flagged three guardrails that already passed the timeout, a few lines away from where the original fix put it. A sibling that already has every line a change introduced is no longer reported.
3. **Different additions merged into one finding.** Five commits added different lines at the same place in litellm's guardrails, and they were reported as one change. Additions are now told apart by what they add, not only by where.

## Reproduce a run

```bash
git clone --shallow-since=2023-01-01 --single-branch https://github.com/laravel/framework.git
cd framework
git checkout 5fd21848a2ab1b53213cd17635b9feaaa13cbc6f
npx half-fixed scan
npx half-fixed show hf-ad34d02
```

Use the revision from the results table to get the same output.
