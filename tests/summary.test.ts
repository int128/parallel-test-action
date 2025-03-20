import { formatTimeInMinSec } from '../src/summary.js'

describe('formatTimeInMinSec', () => {
  it.each([
    [0, '0:00.0'],
    [0.1, '0:00.1'],
    [1, '0:01.0'],
    [59, '0:59.0'],
    [59.9, '0:59.9'],
    [60, '1:00.0'],
    [60.1, '1:00.1'],
    [61, '1:01.0'],
    [119, '1:59.0'],
    [120, '2:00.0'],
    [121, '2:01.0'],
    [3599, '59:59.0'],
    [3600, '60:00.0'],
    [3601, '60:01.0'],
  ])('should format %d to %s', (seconds, expected) => {
    expect(formatTimeInMinSec(seconds)).toBe(expected)
  })
})
