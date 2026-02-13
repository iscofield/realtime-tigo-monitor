# Review: String Series-Parallel Wiring Configuration

## Review Status
- **Spec:** docs/specs/2026-02-12-string-wiring-config.md
- **Started:** 2026-02-12
- **Last Updated:** 2026-02-13
- **Iteration:** 5 of 5
- **Status:** COMPLETE

## Summary
| Severity | Open | Resolved |
|----------|------|----------|
| CRITICAL | 0    | 2        |
| HIGH     | 0    | 4        |
| MEDIUM   | 0    | 12       |
| LOW      | 0    | 5        |

## Iteration History
| Iter | Found | Resolved | New | Focus Areas |
|------|-------|----------|-----|-------------|
| 1    | 15    | 15       | 0   | Full review (RC-1 through RC-19) |
| 2    | 5     | 5        | 0   | Verify fixes, stale references, serialization scope |
| 3    | 3     | 3        | 0   | Pydantic v2 serialization, sequence diagram, code comments |
| 4    | 1     | 1        | 0   | Verify @model_serializer, stale prose reference |
| 5    | 0     | 0        | 0   | Final verification — ALL CLEAR |

## Open Issues
(none)

## Resolved Issues

### RC-3-001 [CRITICAL] — String Current Formula Electrically Incorrect
**Resolution:** Changed formula from `sum(all currents)` to `avg(currents) × P`. For P=1, this matches existing average behavior. For P>1, correctly reflects parallel addition. Updated code sample and Mermaid diagram.

### RC-3-002 [HIGH] — Voltage Formula Rationale Misleading
**Resolution:** Rewrote rationale to acknowledge it's an approximation assuming uniform voltage distribution across parallel groups. Added note about shading limitations.

### RC-10-001 [HIGH] — PanelData Injection Path Unspecified
**Resolution:** Added two implementation options to FR-4.1: Option A (frontend lookup from SystemConfig — recommended) and Option B (backend injection into PanelData). Updated code samples and NFR-3 to reflect both approaches.

### RC-17-001 [HIGH] — Cross-Spec String Name Constraint
**Resolution:** Added note below FR-1.2 documenting dependency on single-letter string name constraint.

### RC-17-002 [HIGH] — System-Level Summary Needs Two-Level Aggregation
**Resolution:** Rewrote FR-4.3 with explicit two-level aggregation pseudocode. Added out-of-scope note about STRING_TO_INVERTER mapping (also resolves RC-17-004).

### RC-7-001 [MEDIUM] — New String Undefined Field Handling
**Resolution:** Updated FR-2.1 to specify WiringBadge treats undefined, null, and omitted identically.

### RC-10-002 [MEDIUM] — Model Validator Defeats YAML Omission
**Resolution:** Changed model_validator to validate-only (no mutation of None). Added effective_series/effective_parallel properties. Replaced standalone serialize_string_config with model_dump(exclude_none=True).

### RC-17-003 [MEDIUM] — Backup Restore Pre-Feature Test Case
**Resolution:** Added explicit pre-feature backup test case to Task 10.

### RC-15-001 [MEDIUM] — Popover Overflow Clipping
**Resolution:** Changed FR-3.3 to specify ReactDOM.createPortal to document.body with fixed positioning. Updated NFR-4.

### RC-4-001 [MEDIUM] — Fallback Discontinuity
**Resolution:** Updated FR-4.4 to explicitly note that corrected P=1 formula (average) matches existing behavior, ensuring no visible change on deployment.

### RC-7-002 [MEDIUM] — Popover Height for Many Factor Pairs
**Resolution:** Added FR-2.4.1 specifying max-height: 300px with overflow-y: auto for >6 options.

### RC-17-004 [MEDIUM] — Hardcoded STRING_TO_INVERTER Mapping
**Resolution:** Added out-of-scope note in FR-4.3 acknowledging the dependency and recommending eventual replacement.

### RC-14-001 [LOW] — Serialization Function Integration
**Resolution:** Replaced standalone serialize_string_config with model_dump(exclude_none=True) approach, integrated into existing save flow description.

### RC-5-001 [LOW] — Popover Close Delay Debounce
**Resolution:** Added click lock during 200ms close delay to FR-2.5.

### RC-12-001 [LOW] — Incomplete Related Specifications Table
**Resolution:** Added multi-user-config-phase1, backup-restore, and table-view-ux-overhaul specs to Related Specifications table.

### RC-3-003 [MEDIUM] — Task 8 Stale Formula Wording
**Resolution:** Updated Task 8 description from "switch current from average to sum" to "correct voltage (divide by P) and current (average × P) aggregates per FR-4.2".

### RC-3-004 [MEDIUM] — Task 2 Unconditionally Extends PanelData
**Resolution:** Rewrote Task 2 with conditional paths: Option A (recommended) fetches SystemConfig and builds lookup map; Option B extends PanelData model.

### RC-3-005 [MEDIUM] — Sequence Diagram Shows Option B Not Option A
**Resolution:** Updated sequence diagram to show Option A flow (frontend GET /api/config/system → build lookup → correct aggregates) with Option B noted as alternative.

### RC-14-002 [MEDIUM] — model_dump(exclude_none=True) Broader Than Acknowledged
**Resolution:** Scoped exclude_none to StringConfig only by overriding `model_dump` on StringConfig class. Top-level `config.model_dump()` remains unchanged, preserving serialization of other Optional fields (MQTTConfig.username/password).

### RC-3-006 [LOW] — Changelog "No Mutation" Misleading
**Resolution:** Clarified changelog wording to specify "no mutation when both fields omitted; one-field-provided still derives the other".

### RC-3-007 [CRITICAL] — Pydantic v2 model_dump Override Bypass
**Resolution:** Replaced `model_dump()` override with `@model_serializer(mode='wrap')` decorator, which correctly integrates with Pydantic v2's Rust serialization pipeline for nested models. Added explanation of why `model_dump()` override doesn't work.

### RC-6-001 [MEDIUM] — Wrong Endpoint URL in Sequence Diagram
**Resolution:** Changed `POST /api/config/save` to `PUT /api/config/system (saveSystemConfig)` to match actual codebase endpoint.

### RC-3-008 [MEDIUM] — Stale Comment Referencing Old Serialization Approach
**Resolution:** Updated model_validator comment from referencing `model_dump(exclude_none=True)` to `@model_serializer`.

### RC-3-009 [LOW] — Stale Prose Reference to model_dump(exclude_none=True)
**Resolution:** Updated prose paragraph between model code blocks from referencing `model_dump(exclude_none=True)` to `@model_serializer (see YAML Serialization below)`.
