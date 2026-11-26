# Lab 6 – Exchange 2: our UAT results on the partner's app

Our team's (asamapornch, warunwora) results from running UAT against the partner's app (`phittayanan/habit-tracker`, tag `v1.3`, commit `50f5605d266d881b4afba3f8ac96d40882f26fd2`), plus an exploratory round and a local, code-level investigation. Evidence screenshots are in `evidence/`.

| Case | Category | Verdict | Testers | Date and approximate time | File |
| --- | --- | --- | --- | --- | --- |
| UAT-01 | Normal journey | PASS | asamapornch and warunwora (warunwora gave his opinion on the results) | 2026-11-25, approx. 13:34–13:54 Asia/Bangkok | [UAT-01-result.md](UAT-01-result.md) |
| UAT-02 | Business rule/boundary | PASS | asamapornch and warunwora (warunwora gave his opinion on the results) | 2026-11-25, approx. 14:03–14:17 Asia/Bangkok | [UAT-02-result.md](UAT-02-result.md) |
| UAT-03 | Forbidden role/ownership | PASS | asamapornch and warunwora (warunwora gave his opinion on the results) | 2026-11-25, approx. 14:22–14:36 Asia/Bangkok | [UAT-03-result.md](UAT-03-result.md) |
| UAT-04 | State/history/persistence | PASS | asamapornch and warunwora (warunwora gave his opinion on the results) | 2026-11-25, approx. 14:40–14:49 Asia/Bangkok | [UAT-04-result.md](UAT-04-result.md) |
| EXP-1 | Exploratory (acceptance criteria not reached by UAT-01 to UAT-04) | PASS (confirmed by asamapornch on 2026-11-26) | asamapornch and warunwora | 2026-11-25, approx. 15:06–17:35 Asia/Bangkok | [EXP-1-result.md](EXP-1-result.md) |
| LOCAL-1 | Local code-read and local test of the partner's code at commit `50f5605` | 3 differences found, reported as Issues [#126](https://github.com/phittayanan/habit-tracker/issues/126) and [#127](https://github.com/phittayanan/habit-tracker/issues/127); not a PASS/FAIL case | not recorded in the file | not recorded in the file | [LOCAL-1-result.md](LOCAL-1-result.md) |
| RETEST-126-127 | Retest of partner fixes (#126, #127) on v1.4 build 056ee5c | PASS (4 of 4; the edit case used our own unused EXP-EditA template) | asamapornch | 2026-11-26, about 21:10 to 21:30 (approximate) Asia/Bangkok | [RETEST-126-127-result.md](RETEST-126-127-result.md) |

The retest comments were posted in https://github.com/phittayanan/habit-tracker/issues/126 and https://github.com/phittayanan/habit-tracker/issues/127.

All dates/times above are as recorded in each file (derived from evidence file modification times, not a stopwatch record, except where the file itself says otherwise). `LOCAL-1-result.md` records no tester or date/time field; this is stated here rather than guessed.

`results-template.md` in this directory is the original empty template for the partner's own UAT cases against our app and is unchanged.

## Evidence notes

Checked by SHA-1 checksum, these files in `evidence/` are byte-identical within each group (the same screen supports more than one step/case, noted at each file's evidence line in the result files above):

- `EXP-1-AC-08.12.png`, `UAT-04-D4.png`, `UAT-04-D5.png`, `UAT-04-E1.png`, `UAT-04-E3.png`
- `UAT-04-A4.png`, `UAT-04-C3.png`, `UAT-04-F1.png`, `UAT-04-F3.png`
- `UAT-03-A9.png`, `UAT-03-C6.png`, `UAT-03-D5.png`
- `UAT-02-A4.png`, `UAT-03-C1.png`, `UAT-04-A1.png`
- `UAT-02-B5.png`, `UAT-02-B7.png`
- `UAT-03-B2.png`, `UAT-03-B5.png`
- `UAT-01-step1.png`, `UAT-01-step10.png`
- `UAT-01-step9.png`, `UAT-03-A2.png`

All evidence images were reviewed for secrets by asamapornch and by Claude Code; the reviewer warunwora opened only a sample.
