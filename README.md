# parallel-test-action [![ts](https://github.com/int128/parallel-test-action/actions/workflows/ts.yaml/badge.svg)](https://github.com/int128/parallel-test-action/actions/workflows/ts.yaml)

This action distributes the test files to the shards based on the estimated time from the test reports.

## Getting Started

Here is an example workflow to run tests in parallel.

```yaml
on:
  push:
    branches:
      - main
  pull_request:

jobs:
  test:
    strategy:
      matrix:
        shard-id: [1, 2, 3]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: int128/parallel-test-action@v0
        id: parallel-test
        with:
          test-files: 'tests/**/*.test.ts'
          test-report-branch: main
          test-report-artifact-name-regexp: test-report-\d+
          shard-count: 3
      - uses: actions/setup-node@v4
      # ...snip...
      - run: xargs pnpm run test -- < "$SHARD_FILE"
        env:
          SHARD_FILE: ${{ steps.parallel-test.outputs.shards-directory }}/${{ matrix.shard-id }}
      - if: github.ref_name == 'main'
        uses: actions/upload-artifact@v4
        with:
          name: test-report-${{ matrix.shard-id }}
          path: junit.xml
```

## How it works

You need to upload the test reports as artifacts on the default branch.
It is required to estimate the time of each test file.

This action generates the shard files by the following steps:

1. Find the test files of the given glob pattern (e.g. `tests/**/*.test.ts`) in the working directory.
2. Download the test reports from the last workflow run of specified branch (e.g. main branch).
3. Calculate the estimated time of each test file.
4. Distribute the test files to the shards based on the estimated time.
5. Write the shard files to the temporary directory.

Each shard file contains the list of test files.
For example,

```
tests/foo.test.ts
tests/bar.test.ts
```

Your testing framework should run the test files in the shard file.

## Specification

### Inputs

| Name                               | Default                | Description                              |
| ---------------------------------- | ---------------------- | ---------------------------------------- |
| `working-directory`                | `.`                    | Working directory                        |
| `test-files`                       | (required)             | Glob pattern of test files               |
| `test-report-branch`               | (required)             | Branch to find the test report artifacts |
| `test-report-artifact-name-regexp` | (required)             | Pattern of the test report artifact name |
| `shard-count`                      | (required)             | Number of shards                         |
| `shards-artifact-name`             | `parallel-test-shards` | Name of the shards artifact              |
| `token`                            | (github.token)         | GitHub token                             |

### Outputs

| Name               | Description                        |
| ------------------ | ---------------------------------- |
| `shards-directory` | Directory to store the shard files |
