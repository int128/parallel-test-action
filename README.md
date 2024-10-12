# parallel-test-action [![ts](https://github.com/int128/parallel-test-action/actions/workflows/ts.yaml/badge.svg)](https://github.com/int128/parallel-test-action/actions/workflows/ts.yaml)

This action distributes the test files to the shards based on the estimated time from the test reports.
If you have a lot of tests, you can reduce the time by running the parallel test jobs.

## Getting Started

### Jest

Here is an example workflow for Jest.

```yaml
jobs:
  test:
    strategy:
      matrix:
        shard-id: [1, 2, 3]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: int128/parallel-test-action@v1
        id: parallel-test
        with:
          test-files: 'tests/**/*.test.ts'
          test-report-artifact-name-prefix: test-report-
          test-report-branch: main
          shard-count: 3
      - uses: actions/setup-node@v4
      # ...snip...
      - run: xargs pnpm run test -- < "$SHARD_FILE"
        env:
          SHARD_FILE: ${{ steps.parallel-test.outputs.shards-directory }}/${{ matrix.shard-id }}
      - uses: actions/upload-artifact@v4
        with:
          name: test-report-${{ matrix.shard-id }}
          path: junit.xml
```

You can generate a test report using [jest-junit](https://github.com/jest-community/jest-junit).
This action requires `file` attribute of the test report.
See [jest.config.js](jest.config.js) for example.

### RSpec

Here is an example workflow for RSpec.

```yaml
jobs:
  test:
    strategy:
      matrix:
        shard-id: [1, 2, 3]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: int128/parallel-test-action@v1
        id: parallel-test
        with:
          test-files: 'spec/**/*_spec.rb'
          test-report-artifact-name-prefix: test-report-
          test-report-branch: main
          shard-count: 3
      - uses: ruby/setup-ruby@v1
      # ...snip...
      - run: xargs bundle exec rspec --format RspecJunitFormatter --out rspec.xml < "$SHARD_FILE"
        env:
          SHARD_FILE: ${{ steps.parallel-test.outputs.shards-directory }}/${{ matrix.shard-id }}
      - uses: actions/upload-artifact@v4
        with:
          name: test-report-${{ matrix.shard-id }}
          path: rspec.xml
```

You can generate a test report using [rspec_junit_formatter](https://github.com/sj26/rspec_junit_formatter).

## How it works

### Test files distribution

This action distibutes the test files to the shards based on the estimated time.
It uses the greedy algorithm.

Here is the example of the distribution:

```mermaid
graph TB
  subgraph Test Files
    TF1[Test File #1]
    TF2[Test File #2]
    TF3[Test File #3]
    TF4[Test File #4]
    TF5[Test File #5]
  end
  subgraph Shard Files
    S1[Shard #1]
    S2[Shard #2]
    S3[Shard #3]
  end
  TF1 --> S1
  TF2 --> S1
  TF3 --> S2
  TF4 --> S3
  TF5 --> S3
```

Each shard should contain the test files with the similar estimated time.

You need to upload the test reports as artifacts on the default branch.
It is required to estimate the time of each test file.
If a test file is not found in the test reports, this action assumes the average time of all test files.
If no test report is given, this action falls back to the round-robin distribution.

### Action overview

Here is the inputs and outputs of this action:

- Test Files (input)
  - This action finds the test files specified by a glob pattern (e.g. `tests/**/*.test.ts`).
- Test Reports (input)
  - This action finds the last success workflow run of the specified branch, and downloads the test reports.
  - A test report should contain the duration of each test case.
- Shard Files (output)
  - This action generates the shard files based on the estimated time of each test file.
  - A shard file contains the list of test files.
  - Each job should run the tests in the corresponding shard file. For example, job #1 runs the tests in shard #1.

Here is the flow of test job:

```mermaid
graph TB
  LTR[Test Report #1...#N of the last workflow run] --> A
  subgraph Test Job #1
    A[parallel-test-action]
    WT1[Test Files in the working directory] --> A
    subgraph SF[Shard Files]
      S1[Shard #1]
      S3[Shard ... #N]
    end
    A --> SF
    S1 --> T[Testing Framework]
  end
```

### Workflow overview

The test workflow runs the test jobs in parallel.
Each job should process the corresponding shard.

When this action is run in parallel jobs, each job may generate the different shard files.
To avoid the race condition, this action acquires the lock as follows:

1. The first job uploads the shards as an artifact.
   This operation is atomic since GitHub Actions Artifact rejects the same named artifact.
2. The subsequent jobs download the shards artifact and use it.
   They discard their generated shards.

Here is the structure of test workflow:

```mermaid
graph TB
  subgraph Future workflow run
    N[parallel-test-action]
  end
  TR1 -.-> N
  TR2 -.-> N
  subgraph Current workflow run
    A1 --Upload--> S[Shards] --Download--> A2
    subgraph J2[Subsequent Job #j]
      A2[parallel-test-action] --> T2[Testing Framework] --> TR2[Test Report #j]
    end
    subgraph J1[First Job #i]
      A1[parallel-test-action] --> T1[Testing Framework] --> TR1[Test Report #i]
    end
  end
  subgraph Last workflow run
    LTR1[Test Report #1] --Download--> A1
    LTR2[Test Report ... #N] --Download--> A1
  end
```

## Specification

### Inputs

| Name                               | Default                | Description                              |
| ---------------------------------- | ---------------------- | ---------------------------------------- |
| `working-directory`                | `.`                    | Working directory                        |
| `test-files`                       | (required)             | Glob pattern of test files               |
| `test-report-artifact-name-prefix` | (required)             | Prefix of the test report artifact name  |
| `test-report-branch`               | (required)             | Branch to find the test report artifacts |
| `shard-count`                      | (required)             | Number of shards                         |
| `shards-artifact-name`             | `parallel-test-shards` | Name of the shards artifact              |
| `token`                            | (github.token)         | GitHub token                             |

If a single workflow contains the different types of tests,
you need to explicitly set the `shards-artifact-name` to avoid the conflict.

### Outputs

| Name               | Description                        |
| ------------------ | ---------------------------------- |
| `shards-directory` | Directory to store the shard files |

This action writes the shard files to the temporary directory.
The shards directory looks like:

```
/home/runner/work/_temp/parallel-test-action-*/shards/1
/home/runner/work/_temp/parallel-test-action-*/shards/2
/home/runner/work/_temp/parallel-test-action-*/shards/3
...
```

The shard ID starts from 1.

Each shard file contains the list of test files.
For example,

```
tests/foo.test.ts
tests/bar.test.ts
tests/baz.test.ts
...
```

Your testing framework should run the test files in the shard file.
You can construct the command by `xargs`, for example:

```sh
xargs your_testing_framework < '${{ steps.parallel-test.outputs.shards-directory }}/${{ matrix.shard-id }}'
```
