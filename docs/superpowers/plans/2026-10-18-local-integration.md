# Local integration implementation plan

> Execute sequentially in this isolated checkout. User explicitly requests local end-to-end verification before any online merge or deployment.

**Goal:** Run the teammates' scenario UI and output contract through real ima and DeepSeek, then prepare a reproducible deployment package.

**Architecture:** Preserve the Node pipeline and its eight-field model output. Merge scenario PR a48f3bb and main 56f6b3f, pass confirmed customer_context separately, adopt the output handoff schema/prompt, and let the server attach delivery state to the result envelope. Use one source tree; generate the Docker upload directory from an explicit allowlist.

**Tech stack:** Node.js 24, pnpm lockfile, React/Vite, Zod, official ima script, DeepSeek.

## Constraints

- Work only in integrated-app on codex/local-integration. Original service on 8787 and online deployment remain unchanged.
- Use 8791 for local validation, with HOST=127.0.0.1; Docker uses HOST=0.0.0.0 and PORT=7860.
- Load existing credentials from the parent .env.local via SHADOW_ENV_FILE and inherited user environment; never copy secrets into the repository or upload bundle.
- Keep legacy /api/run and its output fields, support /scenario/ and /api/run-scenario.
- Facts come only from real ima retrieval. Fixtures remain explicitly synthetic.

## 1. Output contract and pipeline

Files: contracts/output.schema.json, prompts/system.txt, src/pipeline.mjs, tests/pipeline.test.mjs, tests/shadow.test.mjs, tests/integration.test.mjs.

- [x] Copy the handoff schema; merge handoff prompt with the scenario branch's customer_context rules.
- [x] Update existing success fixtures to follow_up days 1,3,7. Add failing tests for conflicts, incomplete content, duplicate days, missing image reference in source_refs, and unrelated extra refs.
- [x] Implement conditional empty-content validation only when all three content fields are blank; retain all remaining schema checks. Attach delivery.status=blocked with reasons, not a successful publishable draft. Reject partially empty content.
- [x] Require exact days [1,3,7], unique image/source refs, and equality between used and declared refs. Attach draft/needs_images status according to platform counts. This is structural validation, not semantic truth checking.
- [x] Run tests with normal, missing-image and conflict fixtures. Preserve pre-generation no-text-source stop.

## 2. UI and scenario batch integration

Files: src/shadow-batch.mjs, src/scenario-service.mjs, modules/scenario/src/Handoff.jsx, modules/scenario/src/main.jsx, public/index.html.

- [x] Add test: a blocked platform makes final complete=false, while successful platforms remain available.
- [x] Show all eight output sections, product-source images, delivery status, errors, per-platform downloads, and full batch download. Only enable copy when content is a draft.
- [x] Display partial platform_result events as they arrive and preserve them if a later network failure occurs.
- [x] Remove outdated shadow-only labels, retaining the existing input team's layout and evidence/confirmation interaction.
- [x] Build with pnpm build, run pnpm test. Verify both page routes and generated assets.

## 3. Runtime and deployment package

Files: src/config.mjs, server.mjs, Dockerfile, .dockerignore, scripts/package-modelscope.mjs, package.json, deployment tests.

- [x] Keep loopback default for local mode; allow public request hosts and forwarded HTTPS origin only in configured cloud bind mode. Preserve same-origin checks and ModelScope embedding policy.
- [x] Build React in a Node 24 Docker build stage using the pinned package manager and frozen lockfile; copy only runtime modules, production dependencies and built static files into runtime stage.
- [x] Generate modelscope-upload from a source allowlist; exclude credentials, caches, history, fixtures and historical outputs. Never hand-edit duplicate runtime sources.
- [x] Test cloud host/proxy/static routing; scan upload content against known local credentials without printing them.

## 4. Local real end-to-end validation

Files: scripts/smoke-local.mjs, README.md, docs/local-integration-verification.md (summary only); ignored output and tmp hold actual run artifacts.

- [x] Start integrated service on 8791 with inherited DeepSeek key and external ima configuration.
- [ ] Exercise real analyze → confirm → handoff → ima retrieval → three-platform generation. Use a clearly labeled synthetic business-travel scenario, ask for no automatic sending or quoting.
- [x] Verify source identity, images, final NDJSON events, platform JSON envelopes, copy/download interactions and desktop/mobile layout. Save the evidence and exact source revisions.
- [x] If model output fails a new rule, inspect the failure and fix prompt/validation consistency; do not fabricate missing facts or downgrade the check.
- [x] Run appropriate final tests and package validation. Leave local app available to user, report URL and limitations, do not push or deploy.

## Actual outcome

Local build and 46 tests pass. Real DeepSeek analysis and three-platform generation passed with explicitly enabled, previously retrieved ima texts/images. Fresh ima retrieval returned 220021 (daily quota reached), so the live retrieval checkbox remains open. Cache source timestamps are preserved, missing images are labeled, and upstream form edits are locked during generation. Saved results can be restored after restart. No GitHub push or ModelScope deployment. Docker engine unavailable; image build remains unverified. See docs/local-integration-verification.md. Browser scripts and run artifacts remain under ignored tmp/ and output/.
