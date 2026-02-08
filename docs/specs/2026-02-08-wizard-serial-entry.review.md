# Review: Wizard Serial Number Entry Step

## Review Status
- **Spec:** docs/specs/2026-02-08-wizard-serial-entry.md
- **Started:** 2026-02-08
- **Last Updated:** 2026-02-08
- **Iteration:** 3 of 5
- **Status:** COMPLETE (all_clear on iteration 3)

## Summary
| Severity | Open | Resolved |
|----------|------|----------|
| CRITICAL | 0    | 1        |
| HIGH     | 0    | 4        |
| MEDIUM   | 0    | 8        |
| LOW      | 0    | 5        |

## Iteration History
| Iter | Found | Resolved | New | Focus Areas |
|------|-------|----------|-----|-------------|
| 1    | 15    | 15       | 0   | Full review |
| 2    | 3     | 3        | 0   | Verify fixes, code sample consistency, test coverage |
| 3    | 0     | 0        | 0   | All clear — spec ready for implementation |

## Open Issues
(none)

## Resolved Issues

### RC-6-001 [CRITICAL] — Duplicate STEP_ORDER in SetupWizard.tsx
**Resolution:** Documented both STEP_ORDER locations in spec. Added explicit note about SetupWizard.tsx handleGoNext inline array. Updated task breakdown to include this file.

### RC-5-001 [HIGH] — No duplicate serial validation
**Resolution:** Added FR-2.6 requiring globally unique serials with inline error message showing which panel has the duplicate.

### RC-3-001 [HIGH] — Backend log message conflicts with existing log
**Resolution:** Updated Backend Changes section to specify replacing the existing logger.warning message (not adding alongside it). Clarified the technical vs user-friendly message distinction.

### RC-1-001 [HIGH] — Bulk import delimiter ambiguity
**Resolution:** Added note to FR-3.2 that serial numbers are alphanumeric-only and cannot contain delimiters. Added FR-3.7 for format validation on bulk imports.

### RC-6-002 [HIGH] — Next/Skip button contradiction when empty
**Resolution:** Rewrote FR-1.4 to require all serials filled before Next is enabled. Skip is the only path when empty. Removes the ambiguous dual-button-enabled state.

### RC-5-002 [MEDIUM] — No maxLength for serial inputs
**Resolution:** Added maxLength={20} constraint to FR-2.3.

### RC-10-001 [MEDIUM] — Panel model reuse not documented
**Resolution:** Added explicit note in Backend Changes section that existing Panel model is reused as-is.

### RC-7-001 [MEDIUM] — Missing E2E test cases
**Resolution:** Added 6 new test scenarios: Clear All, localStorage persistence, step indicator, keyboard nav, bulk auto-uppercase, duplicate detection.

### RC-15-001 [MEDIUM] — No accessibility requirements
**Resolution:** Added NFR-1.5 covering aria-labels for inputs, aria-describedby for errors, focus trapping on modal, and labeled bulk import textarea.

### RC-13-001 [MEDIUM] — No error handling for failed config generation
**Resolution:** Added FR-8.4 specifying error display, serial data preservation, and retry availability.

### RC-16-001 [MEDIUM] — localStorage failure behavior undefined
**Resolution:** Added note to NFR-1.4 documenting existing silent-failure behavior as acceptable.

### RC-1-002 [MEDIUM] — Invalidation trigger underspecified
**Resolution:** Rewrote FR-7.3 to explicitly state that ANY topology change clears serials, with rationale for the aggressive approach.

### RC-2-001 [LOW] — NFR-1.1 not measurable
**Resolution:** Changed "without noticeable input lag" to "under 100ms input latency."

### RC-3-002 [LOW] — parseBulkSerials error messages differ from FR text
**Resolution:** Updated code sample to accept ccaName param and match FR-3.3 error messages exactly (CCA name, helpful suffixes).

### RC-5-003 [LOW] — Bulk import doesn't handle quoted CSV fields
**Resolution:** Added quote stripping step to parseBulkSerials. Added FR-3.7 for alphanumeric format validation on bulk imports.

### RC-5-004 [MEDIUM] — parseBulkSerials missing maxLength=20 validation
**Resolution:** Added maxLength check (>20 chars) to parseBulkSerials code sample after the minLength check. Error message specifies position, actual length, and 20-char limit.

### RC-5-005 [LOW] — Bulk import + duplicate detection interaction not documented
**Resolution:** Added note to FR-3.4 that after bulk import populates the table, global duplicate detection (FR-2.6) runs across all panels including other CCAs, with inline validation errors shown.

### RC-7-002 [LOW] — Missing test cases for FR-3.7 format validation errors
**Resolution:** Expanded bulk import error test case to explicitly include non-alphanumeric characters, too-short serials, and too-long serials exceeding 20 chars.
