import * as core from '@actions/core'
import { ShardSet } from './shard.js'
import { TestWorkflowRun } from './artifact.js'

export const writeSummary = (shardSet: ShardSet, testWorkflowRun: TestWorkflowRun | undefined) => {
  core.summary.addHeading('Summary of parallel-test-action', 2)

  core.summary.addHeading('Input: Test files', 3)
  core.summary.addRaw(`Found ${shardSet.workingTestFiles.length} test files in the working directory.`)

  core.summary.addHeading('Input: Test reports', 3)
  if (testWorkflowRun) {
    core.summary.addRaw('<p>')
    core.summary.addRaw(`Downloaded ${testWorkflowRun.testReportFiles.length} test reports from `)
    core.summary.addLink('the last success workflow run', testWorkflowRun.url)
    core.summary.addRaw(' to estimate the time of the test files.')
    core.summary.addRaw('</p>')
    core.summary.addList(testWorkflowRun.testReportFiles)
  } else {
    core.summary.addRaw('No test reports found in the last success workflow run.')
  }

  core.summary.addHeading('Output: Test shards', 3)
  core.summary.addRaw('<p>')
  core.summary.addRaw(`Tests are distributed across ${shardSet.shards.length} parallel shards.`)
  core.summary.addRaw('</p>')

  core.summary.addTable([
    [
      { data: 'Shard ID', header: true },
      { data: 'Test files', header: true },
      { data: 'Estimated test cases', header: true },
      { data: 'Estimated time (m:s)', header: true },
    ],
    ...shardSet.shards.map((shard) => [
      `#${shard.id}`,
      `${shard.testFiles.length}`,
      `${shard.totalTestCases}`,
      formatTimeInMinSec(shard.totalTime),
    ]),
    [
      { data: 'Total', header: true },
      { data: `${sumArray(shardSet.shards.map((x) => x.testFiles.length))}` },
      { data: `${sumArray(shardSet.shards.map((x) => x.totalTestCases))}` },
      { data: formatTimeInMinSec(sumArray(shardSet.shards.map((x) => x.totalTime))) },
    ],
  ])

  core.summary.addRaw('<details>')
  core.summary.addRaw(`<summary>Details of ${shardSet.workingTestFiles.length} test files</summary>`)
  core.summary.addTable([
    [
      { data: 'Shard ID', header: true },
      { data: 'Test file', header: true },
      { data: 'Estimated test cases', header: true },
      { data: 'Estimated time (m:s)', header: true },
    ],
    ...shardSet.workingTestFiles.map((f) => [
      f.assignedShardId ? `#${f.assignedShardId}` : `-`,
      f.filename,
      f.existsInTestReports ? `${f.totalTestCases}` : `-`,
      f.existsInTestReports ? formatTimeInMinSec(f.totalTime) : `-`,
    ]),
    [
      { data: 'Total', header: true },
      { data: `${shardSet.workingTestFiles.length}` },
      { data: `${sumArray(shardSet.workingTestFiles.map((x) => x.totalTestCases))}` },
      { data: formatTimeInMinSec(sumArray(shardSet.workingTestFiles.map((x) => x.totalTime))) },
    ],
  ])
  core.summary.addRaw(
    'If a test file does not exist in the test reports, this action assumes the average time of all test files.',
    true,
  )
  core.summary.addRaw('</details>')
}

export const formatTimeInMinSec = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  const zeroPadSeconds = remainingSeconds < 10 ? `0` : ``
  return `${minutes}:${zeroPadSeconds}${remainingSeconds.toFixed(1)}`
}

const sumArray = (arr: number[]): number => arr.reduce((acc, val) => acc + val, 0)
