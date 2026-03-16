---
lat:
  require-code-mention: true
---
# Check MD

Tests for validating wiki links in `lat.md/` markdown files.

## Detects broken links

Given a file with a wiki link pointing to a nonexistent section, [[cli#check#md]] should report it as a broken link.

## Passes with valid links

Given files where all wiki links resolve to existing sections, [[cli#check#md]] should report no errors.
