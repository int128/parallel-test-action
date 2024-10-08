import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as glob from '@actions/glob'
import * as os from 'os'
import * as path from 'path'
import { getOctokit } from './github'
import { downloadLastTestReports } from './artifact'
import { aggregateTestReports } from './junitxml'
import { generateShards, leaderElect } from './shard'

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
  core.info(`Found ${testReportFiles.length} test reports:`)
  for (const f of testReportFiles) {
    core.info(`- ${f}`)
  }

  const testFiles = await aggregateTestReports(testReportFiles)
  core.startGroup(`Found ${testFiles.length} test files in the test reports`)
  for (const f of testFiles.values()) {
    core.info(`- ${f.filename}: ${f.totalTestCases} tests, ${f.totalTime}s`)
  }
  core.endGroup()

  const shards = generateShards(workingTestFilenames, testFiles, inputs.shardCount)
  core.info(`Generated ${shards.length} shards:`)
  for (const [i, shard] of shards.entries()) {
    core.info(`- Shard #${i + 1}: ${shard.testFiles.length} test files, ${shard.totalTime}s`)
  }

  const shardsDirectory = path.join(tempDirectory, 'shards')
  await leaderElect(shards, shardsDirectory, inputs.shardsArtifactName)

  return { shardsDirectory }
}

const globRelative = async (pattern: string) => {
  const globber = await glob.create(pattern)
  const files = await globber.glob()
  const cwd = process.cwd()
  return files.map((f) => path.relative(cwd, f))
}
