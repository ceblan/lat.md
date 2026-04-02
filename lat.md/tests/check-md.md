---
lat:
  require-code-mention: true
---

# Check MD

Tests for validating wiki links in `lat.md/` markdown files.

## Detects broken links

Given a file with a wiki link pointing to a nonexistent section, [[cli#check#md]] should report it as a broken link.

### Detects missing PHP source symbols

Given links to missing symbols in a `.php` file (missing function, type, or method), [[cli#check#md]] should report one broken-link error per missing target.

## Passes with valid links

Given files where all wiki links resolve to existing sections, [[cli#check#md]] should report no errors.

### Passes with PHP source symbol links

Given valid links to PHP symbols (`class`, `interface`, `trait`, `enum`, `const`, function, and methods), [[cli#check#md]] should resolve them without errors.

### Passes with C enum value links

Given `lat.md` links to C enum members, including anonymous enums and `typedef enum` members, [[cli#check#md]] should resolve those values as valid source symbols.

### Passes with C struct field links

Given `lat.md` links to C struct fields using `[[file.h#Struct#field]]` syntax, [[cli#check#md]] should resolve those fields as valid source symbols. Covers pointer fields, plain fields, and fields in typedef'd structs.
