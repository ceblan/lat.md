# Documentation Sync Report

**Tracked range**: `348d6533ae4fbed8c8fc224d360eeca308654e56..HEAD`. Last tracked commit now: `e016a5fe71a95b3cde0471b575ae988065ab1449`.

## Commits Reviewed
| Commit | Message | Documented | Action |
|--------|---------|-----------|--------|
| c6977c6 | lat update++ | Yes (existing) | Previous documentator run — no change needed |
| 6dfd64e | fix bug that concatenate paths | Yes (existing) | Minor bugfix in `--skill` path construction — covered by /lat-sync implementation docs |
| 06c49ef | pi template: support per-turn lat-reminder bypass via nal:bypass event | Yes (superseded) | nal bypass replaced by activate:lat/activate:full; current docs cover replacement behavior |
| 3548819 | Template + pi-integration docs: flip reminder to default-off activation | Yes (existing) | Documented in `pi-integration#Runtime Workflow#Before each task ()` |
| e439adf | feat(lat): read PI_ACTIVATE_LAT env at before_agent_start for child activation | Yes (existing) | Documented in `pi-integration#Runtime Workflow#Env-based child activation` |
| 1bf68ad | docs(lat): document env-based child activation | Yes (existing) | Docs commit — no change needed |
| e1c9409 | feat(template): session-persistent env activation + state file + deactivate:lat | Yes (existing) | Documented in `pi-integration#Runtime Workflow#Env-based child activation` |
| c0209e2 | docs(template): env-based child activation is session-persistent | Yes (existing) | Docs commit — no change needed |
| 538fde2 | fix(template): remove duplicated marker block from AGENTS.md template | No | Skip — one-off template cleanup + version bump (0.11.4→0.11.5) |
| e016a5f | sync(template): port deployed pi extension into pi-extension.ts template | Yes (existing) | `readDocumentatorModel` stale-cache fix documented in `pi-integration#Runtime Workflow#After task completion ()` |

## @lat Tags Added
| File | Line | Tag |
|------|------|-----|
| — | — | No new @lat tags required |

All changed source files (`templates/pi-extension.ts`, `tests/search.test.ts`) already carry `// @lat:` annotations on their key functions, event listeners, and lifecycle hooks. Internal helpers (`resolveLatStateFile`, `loadLatEnabled`, `saveLatEnabled`) are implementation details tied to the already-documented "Env-based child activation" section.

## Link Integrity
- lat check: **PASSED** (0 errors)
- Errors fixed: none

## Additional Actions
- Verified `pi/config/lat.json` does not exist — `@lat` tagging enabled by default (`LAT_LABEL_CODE=true`)
- Step 2 not skipped

## Graph, Bridge & Ontology Refresh

| Action | Status | Details |
|--------|--------|---------|
| graphify update | ✅ ran | 192/192 files, 1121 nodes, 1641 edges, 143 communities |
| bridge-build | ✅ ran | 534 sections, 132/124 @lat resolved, 12/143 communities mapped; 8 pre-existing fixture errors (test cases with intentionally broken refs) |
| ontology-build | ⏭️ skipped | No `ontology/` directory in project root |

## Summary
lat.md is fully in sync — all commits covered by existing documentation, @lat tags present on key symbols, link integrity clean, tracker updated to HEAD, graph and bridge refreshed.
