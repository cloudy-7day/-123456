# Final reconciliation implementation plan

**Goal:** Compare teammate PR #2 with the completed local copy workflow, adopt compatible correctness fixes, and retain one maintained application.

**Architecture:** Keep the existing React UI and Node service. Reuse the same system-filter function in browser and service. Preserve source quotations when reconciling specified products. Generated deployment files are not a second source tree.

**Constraints:** Node.js 24; local knowledge and product-specific images; complete Xiaohongshu copy; no timed clerk scripts; no mandatory unknown budget/software fields; do not modify original 8787 service or force-push Git history.

- [x] Read PR #2 at c642e531875570e47e18c81e7f939217b270da1a; run local and reference offline tests independently.
- [x] Reproduce manual system conflict and known/unknown product inconsistency in `tests/selection-boundary.test.mjs` (two failures before fix).
- [x] Reconcile quoted product observations in `modules/scenario/shared/contract.mjs`; export `restrictSystems`; apply it before `/api/handoff` and `/api/run-scenario` and before browser generation.
- [x] Run `node --test tests/selection-boundary.test.mjs tests/product-suggestion.test.mjs modules/scenario/tests/contract.test.mjs` (23 passed).
- [x] Move required handoff fixtures to `tests/fixtures/output-results`; archive old runnable handoff and standalone entry under ignored `tmp/finalization-backup`.
- [x] Replace old homepage with a link/redirect to `/scenario/`; document the only supported workflow and keep deployment package generated.
- [x] Run full backend suite (73 passed), production build, browser regression and package integrity check (1,573 manifest hashes) after the final changes.
- [x] Review staged changes; preserve Git history and report remaining boundaries without claiming universal model correctness. Runtime restart and live model verification could not execute because automatic approval review reached its usage limit; no bypass attempted.

Reference: https://github.com/cloudy-7day/qiuqiuyaoyao/pull/2
