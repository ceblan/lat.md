# Documentation Sync Report

**Tracked range**: `01567575dd61.....348d6533ae...` (last tracked → HEAD). Last tracked commit now: `348d6533ae4fbed8c8fc224d360eeca308654e56`.

## Commits Reviewed
| Commit | Message | Documented | Action |
|--------|---------|-----------|--------|
| add2b5b33e4 | añadimos soporte para jina embeddings y rerank. Ademas lat cod ++ | Partially | Added 2 missing @lat tags in tests; created 2 missing lat.md test specs |
| 348d6533ae | incremento numero de version a 0.11.4 | No | Skip — version bump, no code/docs change |

## @lat Tags Added
| File | Line | Tag |
|------|------|-----|
| tests/search.test.ts | 55 | `// @lat: [[search#Provider Detection]]` |
| tests/search.test.ts | 177 | `// @lat: [[search#Reranker Config#Includes reranker API key when configured]]` |
| tests/search.test.ts | 188 | `// @lat: [[search#Reranker Config#Env LAT_RERANKER_API_KEY overrides config file]]` |

## Link Integrity
- lat check: **PASSED** (0 errors)
- Errors fixed: none

## Additional Actions
- Created 2 missing test spec leaf sections in `lat.md/tests/search.md`:
  - `Reranker Config#Includes reranker API key when configured`
  - `Reranker Config#Env LAT_RERANKER_API_KEY overrides config file`
- Updated `lat.md/last-commit.md` tracker to HEAD (0.11.4)

## Graph & Bridge Refresh

| Action | Status | Details |
|--------|--------|---------|
| graphify update | ✅ ran | 192/192 files, 1123 nodes, 1641 edges, 142 communities |
| bridge-build | ✅ ran | 532 sections, 128/120 @lat resolved, 11/142 communities mapped; 8 pre-existing fixture errors (unrelated) |

## Summary
lat.md is fully in sync — all @lat tags present, link integrity clean, tracker updated to HEAD.
