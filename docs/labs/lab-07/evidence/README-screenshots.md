# Deploy/CI evidence — CLI output, not screenshots

Originally requested as 4 browser screenshots. No browser-control tool (Claude in Chrome, or the
built-in browser pane) was connected to this session, so no page could be captured visually. At
asamapornch's direction, the same facts are recorded here instead as read-only CLI output
(`gcloud`, `gh`), captured 27 Nov 2026 (Asia/Bangkok) by Claude Code. Each file says so in its own
header and gives the exact command run. No account email, token, secret, or Variables & Secrets
data was read, printed, or included in any of these files.

| File | What it shows |
| --- | --- |
| `cloudrun-revisions-00011.txt` | `gcloud run revisions list` / traffic split for Cloud Run service `s65da36e2` (project `cpe-se-course-2026`, region `asia-southeast1`): the last 6 revisions including `s65da36e2-00009-b4s` and `s65da36e2-00010-2mh`, and confirmation that `s65da36e2-00011-269` serves 100% of traffic. |
| `actions-deploy-b53e7bc.txt` | `gh run view 45812026155`: the "Deploy demo" GitHub Actions run for the Lab 7 release (commit `b53e7bc`, PR #72), both its `test-and-docker` job and its `deploy` job, both `success`. Note: this is the same run the original task called "CI run 45812026155" — the separate "CI" workflow in this repo does not trigger on `main`, so there is no second run to show. |
| `pr72-merged.txt` | `gh pr view 72`: PR #72's merged state, merge commit `b53e7bc`, base/head branches, and merge timestamp. |

**Not captured:** the actual browser screenshots asamapornch asked for (Cloud Run Revisions tab,
Actions run pages, PR #72 page header) — no substitute image was created for any of these; the
text files above are explicitly CLI output, not a replacement screenshot.

**Announcement screenshot:** checked `~/Downloads` for any image newer than
`AB54A8E9-AB53-4A64-90BA-80D0401D2C26.JPG` (the existing cropped screenshot already in this repo as
`lab7-instructor-announcement.jpg`). None exists as of this writing, so
`lab7-instructor-announcement-full.png` was not added.
