import { describe, expect, it } from 'vitest'
import { DistributeStrategy, distributeTestFilesToShards } from '../src/shard.js'

describe('distributeTestFilesToShards', () => {
  it('distributes test files to fixed shards', () => {
    const workingTestFilenames = [
      'fixture1.test.ts',
      'fixture5.test.ts',
      'fixture2.test.ts',
      'fixture4.test.ts',
      'fixture3.test.ts',
    ]
    const reportedTestFiles = [
      { filename: 'fixture1.test.ts', totalTime: 100, totalTestCases: 10 },
      { filename: 'fixture2.test.ts', totalTime: 200, totalTestCases: 20 },
      { filename: 'fixture3.test.ts', totalTime: 300, totalTestCases: 30 },
      { filename: 'fixture4.test.ts', totalTime: 400, totalTestCases: 40 },
      { filename: 'fixture5.test.ts', totalTime: 500, totalTestCases: 50 },
    ]
    const shardSet = distributeTestFilesToShards(workingTestFilenames, reportedTestFiles, {
      shardCount: 3,
    })
    expect(
      shardSet.shards.map((s) => ({
        testFiles: s.testFiles.map((f) => f.filename),
        totalTime: s.totalTime,
        totalTestCases: s.totalTestCases,
      })),
    ).toEqual([
      {
        testFiles: ['fixture5.test.ts'],
        totalTime: 500,
        totalTestCases: 50,
      },
      {
        testFiles: ['fixture4.test.ts', 'fixture1.test.ts'],
        totalTime: 500,
        totalTestCases: 50,
      },
      {
        testFiles: ['fixture3.test.ts', 'fixture2.test.ts'],
        totalTime: 500,
        totalTestCases: 50,
      },
    ])
  })

  it('distributes test files to average time based shards', () => {
    const workingTestFilenames = [
      'fixture1.test.ts',
      'fixture5.test.ts',
      'fixture2.test.ts',
      'fixture4.test.ts',
      'fixture3.test.ts',
    ]
    const reportedTestFiles = [
      { filename: 'fixture1.test.ts', totalTime: 100, totalTestCases: 10 },
      { filename: 'fixture2.test.ts', totalTime: 200, totalTestCases: 20 },
      { filename: 'fixture3.test.ts', totalTime: 300, totalTestCases: 30 },
      { filename: 'fixture4.test.ts', totalTime: 400, totalTestCases: 40 },
      { filename: 'fixture5.test.ts', totalTime: 500, totalTestCases: 50 },
    ]
    const shardSet = distributeTestFilesToShards(workingTestFilenames, reportedTestFiles, {
      averageShardTime: 500,
      maxShardCount: 10,
    })
    expect(
      shardSet.shards.map((s) => ({
        testFiles: s.testFiles.map((f) => f.filename),
        totalTime: s.totalTime,
        totalTestCases: s.totalTestCases,
      })),
    ).toEqual([
      {
        testFiles: ['fixture5.test.ts'],
        totalTime: 500,
        totalTestCases: 50,
      },
      {
        testFiles: ['fixture4.test.ts', 'fixture1.test.ts'],
        totalTime: 500,
        totalTestCases: 50,
      },
      {
        testFiles: ['fixture3.test.ts', 'fixture2.test.ts'],
        totalTime: 500,
        totalTestCases: 50,
      },
    ])
  })

  it.each([{ strategy: { shardCount: 3 } }, { strategy: { averageShardTime: 100, maxShardCount: 3 } }])(
    'falls back to round-robin if no test report is given for strategy $strategy',
    ({ strategy }) => {
      const workingTestFilenames = [
        'fixture1.test.ts',
        'fixture2.test.ts',
        'fixture3.test.ts',
        'fixture4.test.ts',
        'fixture5.test.ts',
      ]
      const shardSet = distributeTestFilesToShards(workingTestFilenames, [], strategy)
      expect(
        shardSet.shards.map((s) => ({
          testFileCount: s.testFiles.length,
          totalTime: s.totalTime,
          totalTestCases: s.totalTestCases,
        })),
      ).toEqual([
        {
          testFileCount: 1,
          totalTime: 0,
          totalTestCases: 0,
        },
        {
          testFileCount: 2,
          totalTime: 0,
          totalTestCases: 0,
        },
        {
          testFileCount: 2,
          totalTime: 0,
          totalTestCases: 0,
        },
      ])
    },
  )
})
