# Lab 6 – UAT exchange

This lab runs User Acceptance Testing (UAT) with a partner team, as a three-point exchange. Each exchange point is a one-way handoff of documents between the two teams; no code or environment access is exchanged.

## Workflow

1. **Exchange 1 – packages and cases.** Each team hands the other its UAT package: handoff details (product, URL, accounts, scope), the UAT cases, the result sheet template, and an optional AI-assistant prompt. Our package is in `exchange-1/`; the partner's package lands in `exchange-1/partner-package.md`.
2. **Exchange 2 – results and defect reports.** Each team runs the other's cases and returns a filled result sheet plus a defect report (as a GitHub issue) for every FAIL. Our result sheet template is in `exchange-2/results-template.md`; supporting screenshots/evidence go in `exchange-2/evidence/`.
3. **Exchange 3 – fix/retest and final decision.** The product team triages each reported defect (accepted defect / duplicate / not a defect / enhancement), fixes accepted critical/major defects, and sends the new revision back for retest. Only the UAT team signs the final acceptance decision. The triage table is in `exchange-3/triage-template.md`.

No passwords or tokens are ever stored in this repository. Passwords are exchanged out-of-band (direct message to the tester); if one is pasted into a document or issue by mistake, it must be reported immediately so it can be changed.

## Files

| File | Purpose |
| --- | --- |
| `exchange-1/our-uat-package.md` | Our UAT package sent to the partner team (handoff, 6 cases, result sheet, AI prompt) |
| `exchange-1/partner-package.md` | Partner team's UAT package sent to us (placeholder until received) |
| `exchange-2/results-template.md` | Template for the result sheet we fill in when we test the partner's cases |
| `exchange-2/evidence/` | Screenshots and other evidence supporting our result sheet |
| `exchange-3/triage-template.md` | Template for triaging defects reported against our product |
| `../../../.github/ISSUE_TEMPLATE/uat-defect.md` | GitHub issue template the partner team uses to report defects against our product |

## Status

| Exchange | Date | State |
| --- | --- | --- |
| 1 – packages and cases | | not started |
| 2 – results and defect reports | | not started |
| 3 – fix/retest and final decision | | not started |
