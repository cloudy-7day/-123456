# Focused delivery implementation plan

> Execute inline in the existing local integration checkout; preserve local-only scope.

**Goal:** One complete input, extracted dimensions inside collapsible understanding, and final copy plus a clerk demo script. Initially support the single selection campus learning / Xiaohongshu.

**Architecture:** Keep the existing confirmed-analysis API and eight-field model contract. Change presentation and selection defaults; pass the selected scene as publishing context, never invented customer facts. Preserve explicit human confirmation and server blocking rules.

**Tech Stack:** Node.js 24, React/Vite, existing Playwright runtime.

## Constraints
- No changes to the original 8787 service or cloud deployment.
- Latest user instruction replaces ima/cache with the new ZIP; local knowledge becomes the default. No automatic product recommendation.
- Handbook v4 page 5 requires title/body/CTA and image sources; opening slide adds a roughly three-minute actionable clerk script.
- Do not expose model private reasoning; show extracted facts, uncertainty and evidence as an analysis summary.

## Work
- [x] Write a browser regression covering one input, single campus/Xiaohongshu selection, collapsed analysis, explicit confirmation and two final deliverables. Run against current UI and observe failure.
- [x] Add a shared selection catalog in `modules/scenario/shared/experience.mjs`; only campus and Xiaohongshu enabled initially.
- [x] Update `main.jsx`: full-width complete-input area, selection tags, collapsed editable evidence summary; compact confirmation outside details. Remove separate initial product entry and automatic JSON download.
- [x] Update `Handoff.jsx`: selected single platform only, no audience field, compact product confirmation with generation options; keep streaming, failure reporting and input locking.
- [x] Update `ResultView.jsx` and `RecentResults.jsx`: final headings “完整文案” and “店员演示脚本”; copy/export both as text; image/source details folded; keep draft/block/cache warnings. Existing eight fields remain in internal data.
- [x] Strengthen `prompts/system.txt` clerk script to include spoken lines, actions, observable checks and failure handling in four timed segments. Keep existing output types and platform formats.
- [x] Build, run unit and browser checks (including blocked, partial error, input editing invalidation and mobile), and perform a real campus/Xiaohongshu DeepSeek run using the new local archive.
- [x] Regenerate the upload package, check exclusions, record local validation; no online writes.

## User steering and completed work

The user supplied 华为PC知识库(2).zip during implementation, authorizing local retrieval instead of ima. Imported 1,522 inert original files, 10 products, 68 indexed images, with safe paths and hashes. Local provider, catalog endpoint and bundled deployment data implemented and tested (53 backend tests). Real campus/Xiaohongshu run returned a draft with four local images and timed clerk script. Browser tests pass including input-reset regression from review. No cloud writes.
