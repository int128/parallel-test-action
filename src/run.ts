import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as glob from '@actions/glob'
import * as os from 'os'
import * as path from 'path'
import { getOctokit } from './github'
import { downloadLastTestReports } from './artifact'
import { findTestCasesFromTestReportFiles, groupTestCasesByTestFile } from './junitxml'
import { generateShards, writeShardsWithLeaderElection } from './shard'

type Inputs = {
  workingDirectory: string
  testFiles: string
  testReportBranch: string
  testReportArtifactNamePrefix: string
  shardCount: number
  shardsArtifactName: string
  owner: string
  repo: string
  workflowFilename: string
  token: string
}

type Outputs = {
  shardsDirectory: string
}

export const run = async (inputs: Inputs): Promise<Outputs> => {
  process.chdir(inputs.workingDirectory)
  const workingTestFilenames = await globRelative(inputs.testFiles)
  core.info(`Found ${workingTestFilenames.length} test files in the working directory`)

  const octokit = getOctokit(inputs.token)
  const tempDirectory = await fs.mkdtemp(`${process.env.RUNNER_TEMP || os.tmpdir()}/parallel-test-action-`)

  const testReportDirectory = path.join(tempDirectory, 'test-reports')
  const testReportFiles = await downloadLastTestReports(octokit, {
    testReportBranch: inputs.testReportBranch,
    testReportArtifactNamePrefix: inputs.testReportArtifactNamePrefix,
    testReportWorkflow: inputs.workflowFilename,
    testReportDirectory,
    owner: inputs.owner,
    repo: inputs.repo,
    token: inputs.token,
  })

  const allTestCases = await findTestCasesFromTestReportFiles(testReportFiles)
  core.info(`Found ${allTestCases.length} test cases in the test reports`)
  const testFiles = groupTestCasesByTestFile(allTestCases)
  const shards = generateShards(workingTestFilenames, testFiles, inputs.shardCount)
  core.info(`Generated ${shards.length} shards`)

  const shardsDirectory = path.join(tempDirectory, 'shards')
  const leaderElection = await writeShardsWithLeaderElection(shards, shardsDirectory, inputs.shardsArtifactName)

  if (leaderElection.leader) {
    core.summary.addHeading('Generated shards')
    core.summary.addTable([
      [
        { data: 'Index', header: true },
        { data: 'Test files', header: true },
        { data: 'Test cases', header: true },
        { data: 'Total time (s)', header: true },
      ],
      ...shards.map((shard, i) => [
        `#${i + 1}`,
        `${shard.testFiles.length}`,
        `${shard.totalTestCases}`,
        shard.totalTime.toFixed(1),
      ]),
    ])

    core.summary.addHeading('Input of the test reports')
    core.summary.addTable([
      [
        { data: 'Test file', header: true },
        { data: 'Test cases', header: true },
        { data: 'Total time (s)', header: true },
      ],
      ...testFiles.map((f) => [f.filename, `${f.totalTestCases}`, f.totalTime.toFixed(1)]),
    ])
  }

  core.info(`Available ${leaderElection.shardFilenames.length} shard files:`)
  for (const shardFilename of leaderElection.shardFilenames) {
    core.info(`- ${shardFilename}`)
  }
  return { shardsDirectory }
}

const globRelative = async (pattern: string) => {
  const globber = await glob.create(pattern)
  const files = await globber.glob()
  const cwd = process.cwd()
  return files.map((f) => path.relative(cwd, f))
}
