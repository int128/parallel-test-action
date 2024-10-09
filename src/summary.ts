import * as core from '@actions/core'
import { ShardSet } from './shard'
import { TestReportSet } from './artifact'

export const writeSummary = (shardSet: ShardSet, testReportSet: TestReportSet) => {
  core.summary.addHeading('Summary of parallel-test-action')
  core.summary.addRaw(
    'This action distributes the test files to the shards based on the estimated time from the test reports.',
    true,
  )
  core.summary.addHeading('Shards', 2)
  core.summary.addTable([
    [
      { data: 'ID', header: true },
      { data: 'Test files', header: true },
      { data: 'Estimated test cases', header: true },
      { data: 'Estimated time (s)', header: true },
    ],
    ...shardSet.shards.map((shard) => [
      `#${shard.id}`,
      `${shard.testFiles.length}`,
      `${shard.totalTestCases}`,
      formatTimeInMinSec(shard.totalTime),
    ]),
    [
      { data: 'Total', header: true },
      { data: `${shardSet.shards.reduce((x, y) => x + y.testFiles.length, 0)}`, header: true },
      { data: `${shardSet.shards.reduce((x, y) => x + y.totalTestCases, 0)}`, header: true },
      { data: formatTimeInMinSec(shardSet.shards.reduce((x, y) => x + y.totalTime, 0)), header: true },
    ],
  ])

  core.summary.addHeading('Test files in the working directory', 2)
  core.summary.addTable([
    [
      { data: 'Test file', header: true },
      { data: 'Test cases', header: true },
      { data: 'Total time (s)', header: true },
      { data: 'Shard', header: true },
    ],
    ...shardSet.workingTestFiles.map((f) => [
      f.filename,
      f.existsInTestReports ? `${f.totalTestCases}` : `-`,
      f.existsInTestReports ? formatTimeInMinSec(f.totalTime) : `-`,
      f.assignedShardId ? `#${f.assignedShardId}` : `-`,
    ]),
  ])
  core.summary.addRaw(
    'If a test file does not exist in the test reports, this action assumes the average time of all test files.',
    true,
  )

  core.summary.addHeading('Test reports', 2)
  if (testReportSet.workflowRunUrl) {
    core.summary.addRaw('This action downloaded the test reports from')
    core.summary.addLink('the last success workflow run', testReportSet.workflowRunUrl)
  }
  core.summary.addList(testReportSet.testReportFiles)
}

export const formatTimeInMinSec = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  const zeroPadSeconds = remainingSeconds < 10 ? `0` : ``
  return `${minutes}:${zeroPadSeconds}${remainingSeconds.toFixed(1)}`
}
