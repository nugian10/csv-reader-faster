# csv-reader-faster

[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/nugian10/csv-reader-faster/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/nugian10/csv-reader-faster/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A fast, exact drop-in for csv-reader 1.0.0: it reads broken CSV files —
stray carriage returns, quotes that never close, junk after a closing quote,
short and long rows, blank lines — and returns exactly what csv-reader
returns (`{columns, rows, errors}`), only faster. Plain records are cut out
of the text with `indexOf` and split on commas in one go; only records that
actually hold a quote or a stray CR go through the field-by-field reader.

## Run it

Requires Node.js 22.18 or later. Put the cases in `/input/cases.json`
(a JSON array of `{"id", "input"}` with `input` as `{text, header}`), then:

```sh
node main.ts
```

The answers land in `/output/answers.json`, one per case, in case order.
`MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` override `/input` and `/output`.
