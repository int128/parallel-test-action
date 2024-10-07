# parallel-test-action [![ts](https://github.com/int128/parallel-test-action/actions/workflows/ts.yaml/badge.svg)](https://github.com/int128/parallel-test-action/actions/workflows/ts.yaml)

TBD

## Getting Started

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: int128/parallel-test-action@v0
        with:
          name: hello
```

### Inputs

| Name   | Default    | Description   |
| ------ | ---------- | ------------- |
| `name` | (required) | example input |

### Outputs

| Name      | Description    |
| --------- | -------------- |
| `example` | example output |
