import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as glob from '@actions/glob'
import * as os from 'os'
import * as path from 'path'
import { getOctokit } from './github'
import { downloadLastTestReports } from './artifact'
import { findTestCasesFromTestReportFiles, groupTestCasesByTestFile } from './junitxml'
import { generateShards, writeShardsWithLeaderElection } from './shard'
import { writeSummary } from './summary'

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
  const testReportSet = await downloadLastTestReports(octokit, {
    testReportBranch: inputs.testReportBranch,
    testReportArtifactNamePrefix: inputs.testReportArtifactNamePrefix,
    testReportWorkflow: inputs.workflowFilename,
    testReportDirectory,
    owner: inputs.owner,
    repo: inputs.repo,
    token: inputs.token,
  })

  const allTestCases = await findTestCasesFromTestReportFiles(testReportSet.testReportFiles)
  core.info(`Found ${allTestCases.length} test cases in the test reports`)
  const testFiles = groupTestCasesByTestFile(allTestCases)
  const shardSet = generateShards(workingTestFilenames, testFiles, inputs.shardCount)
  core.info(`Generated ${shardSet.shards.length} shards`)

  const shardsDirectory = path.join(tempDirectory, 'shards')
  const leaderElection = await writeShardsWithLeaderElection(
    shardSet.shards,
    shardsDirectory,
    inputs.shardsArtifactName,
  )
  if (leaderElection.leader) {
    writeSummary(shardSet, testReportSet)
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
