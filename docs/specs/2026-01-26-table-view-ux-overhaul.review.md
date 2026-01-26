# Review: Table View UX Overhaul

## Review Status
- **Spec:** docs/specs/2026-01-26-table-view-ux-overhaul.md
- **Started:** 2026-01-26
- **Last Updated:** 2026-01-26
- **Iteration:** 3 of 5
- **Status:** COMPLETE ✅

## Summary
| Severity | Open | Resolved |
|----------|------|----------|
| CRITICAL | 0    | 0        |
| HIGH     | 0    | 4        |
| MEDIUM   | 0    | 9        |
| LOW      | 0    | 4        |

**Total: 17 issues found and resolved across 2 iterations. Iteration 3 confirmed all clear.**

## Iteration History
| Iter | Found | Resolved | New | Focus Areas |
|------|-------|----------|-----|-------------|
| 1    | 13    | 13       | 0   | Initial comprehensive review |
| 2    | 4     | 3        | 0   | Verify fixes, check code consistency |
| 3    | 0     | 0        | 0   | Final verification - ALL CLEAR |

## Open Issues
(none - review complete)

## Resolved Issues

### Iteration 1

#### RC-1-001 [HIGH] - Essential preset doesn't match DEFAULT_COLUMNS
**Location:** FR-1.4 Presets
**Resolution:** Updated FR-1.4 to include 'is_temporary' (Temp ID Warning) in Essential preset. Added note explaining backward compatibility with existing DEFAULT_COLUMNS.

#### RC-1-002 [MEDIUM] - Ambiguous "~4 fields per row"
**Location:** FR-4.4
**Resolution:** Changed "max ~4 fields per row" to explicit CSS implementation: "maximum 4 fields per row, using CSS flexbox `flex-wrap: wrap` with each field set to `flex: 0 0 25%`"

#### RC-1-003 [MEDIUM] - Expand/Collapse active state undefined
**Location:** FR-2.4
**Resolution:** Changed SHOULD to MUST and specified exact behavior: "Expand" highlighted when all strings expanded, "Collapse" highlighted when any collapsed. Added visual indication via background color differentiation.

#### RC-3-001 [HIGH] - CCA Source categorization inconsistent
**Location:** FR-1.2 and COLUMN_CATEGORIES
**Resolution:** Moved CCA Source from Status to Identity category in both the prose requirements and code sample.

#### RC-2-001 [HIGH] - Missing dropdown test scenarios
**Location:** Task Breakdown - Phase 5
**Resolution:** Added new task 14 "Dropdown interaction testing" with comprehensive test cases: click to open/close, Escape key, Tab navigation, Space/Enter toggle, ARIA attributes.

#### RC-5-001 [MEDIUM] - Mobile sorting behavior undefined
**Location:** FR-3 Sortable Columns
**Resolution:** Added FR-3.7 specifying that sort state is preserved on mobile and tiles are sorted according to current sort setting when switching viewports.

#### RC-6-001 [MEDIUM] - CCA Source tile visibility ambiguous
**Location:** FR-5.2
**Resolution:** Clarified that CCA Source visibility in Row 1 is controlled by column visibility setting — if disabled, Row 1 shows only Panel ID and Age.

#### RC-7-001 [MEDIUM] - Missing sorting E2E tests
**Location:** Task Breakdown - Phase 5
**Resolution:** Added new task 15 "Sorting feature testing" with test cases: indicator cycling, data order, Summary row position, localStorage persistence, column switching.

#### RC-15-001 [HIGH] - Sortable headers lack ARIA attributes
**Location:** SortableHeader code sample
**Resolution:** Updated code sample with: aria-sort attribute, handleKeyDown for Enter/Space, tabIndex={0}, role="columnheader".

#### RC-15-002 [MEDIUM] - Dropdown keyboard accessibility not specified
**Location:** FR-1 Dropdown Column Selector
**Resolution:** Added FR-1.7 specifying full keyboard accessibility: Enter/Space to open, Escape to close, Tab navigation, Space to toggle, focus management, aria-expanded and aria-haspopup attributes.

#### RC-4-001 [MEDIUM] - NFR height constraint vs touch targets tension
**Location:** NFR-2.2
**Resolution:** Softened from MUST to SHOULD with flexibility: "target 48-56px height" with allowance to increase if needed to accommodate 44px touch targets.

#### RC-1-004 [LOW] - Related Specifications incorrect
**Location:** Related Specifications section
**Resolution:** Updated to reference 2026-01-17-tabular-view.md with "extends" relationship, noting backward compatibility with existing DEFAULT_COLUMNS and localStorage keys.

#### RC-3-002 [LOW] - localStorage sort format undefined
**Location:** localStorage Schema
**Resolution:** Added inline comments specifying format for each storage key and example localStorage values showing JSON serialization format.

### Iteration 2

#### RC-3-001 [MEDIUM] - Missing category label mapping in code
**Location:** Column Dropdown Design code sample
**Resolution:** Added CATEGORY_LABELS constant mapping lowercase keys to display labels (identity → 'Identity', etc.)

#### RC-5-001 [MEDIUM] - Arrow key navigation in test but not in requirements
**Location:** Task Breakdown - Phase 5, task 14
**Resolution:** Removed arrow key navigation test since it's not specified in FR-1.7. Updated test to say "Tab navigates through checkboxes and preset buttons in document order".

#### RC-1-001 [LOW] - Mobile sorting is read-only not explicitly stated
**Location:** FR-3.7
**Resolution:** Added clarification: "Mobile view does not provide UI to change sort order; users must switch to desktop view (or rotate to landscape on tablet) to modify sorting."

#### RC-6-001 [LOW] - Essential preset mapping across tile rows
**Location:** FR-1.4, FIELD_ORDER
**Status:** No change needed - the spec is internally consistent. Essential preset columns correctly map to both tile rows (Panel ID/CCA Source in Row 1, others in Row 2).

### Iteration 3

**Result:** ALL CLEAR - No issues found. Specification verified complete and internally consistent.
