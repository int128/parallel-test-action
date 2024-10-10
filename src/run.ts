import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as glob from '@actions/glob'
import * as os from 'os'
import * as path from 'path'
import { getOctokit } from './github'
import { downloadLastTestReports } from './artifact'
import { findTestCasesFromTestReportFiles, groupTestCasesByTestFile } from './junitxml'
import {
  tryDownloadShardsIfAlreadyExists,
  distributeTestFilesToShards,
  writeShardsWithLock,
  verifyTestFiles,
} from './shard'
import { writeSummary } from './summary'

type Inputs = {
  workingDirectory: string
  testFiles: string
  testReportArtifactNamePrefix: string
  testReportBranch: string
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
  const shardsDirectory = path.join(tempDirectory, 'shards')

  // Since multiple jobs run in parallel, another job may have already uploaded the shards.
  if (await tryDownloadShardsIfAlreadyExists(shardsDirectory, inputs.shardsArtifactName)) {
    await ensureTestFilesConsistency(shardsDirectory, workingTestFilenames)
    return { shardsDirectory }
  }

  const testReportDirectory = path.join(tempDirectory, 'test-reports')
  const testReportSet = await downloadLastTestReports(octokit, {
    testReportArtifactNamePrefix: inputs.testReportArtifactNamePrefix,
    testReportBranch: inputs.testReportBranch,
    testReportWorkflow: inputs.workflowFilename,
    testReportDirectory,
    owner: inputs.owner,
    repo: inputs.repo,
    token: inputs.token,
  })

  const allTestCases = await findTestCasesFromTestReportFiles(testReportSet.testReportFiles)
  core.info(`Found ${allTestCases.length} test cases in the test reports`)
  const testFiles = groupTestCasesByTestFile(allTestCases)
  const shardSet = distributeTestFilesToShards(workingTestFilenames, testFiles, inputs.shardCount)
  core.info(`Generated ${shardSet.shards.length} shards`)

  const shardsLock = await writeShardsWithLock(shardSet.shards, shardsDirectory, inputs.shardsArtifactName)
  if (shardsLock.currentJobAcquiredLock) {
    writeSummary(shardSet, testReportSet)
  }

  await ensureTestFilesConsistency(shardsDirectory, workingTestFilenames)
  return { shardsDirectory }
}

const ensureTestFilesConsistency = async (shardsDirectory: string, workingTestFilenames: string[]) => {
  const shardFiles = await globShardFiles(shardsDirectory)
  core.info(`Available ${shardFiles.length} shard files:`)
  for (const f of shardFiles) {
    core.info(`- ${f}`)
  }
  const verifyResult = await verifyTestFiles(workingTestFilenames, shardFiles)
  core.info(`Test files in the working directory: ${workingTestFilenames.length}`)
  core.info(`Test files in the shards: ${verifyResult.shardedTestFiles.length}`)
  core.info(`Missing test files: ${verifyResult.missingTestFiles.length}`)
  if (verifyResult.missingTestFiles.length > 0) {
    throw new Error(
      `Missing test files in the shards. This may be a bug. Please open an issue from https://github.com/int128/parallel-test-action.\n` +
        `The test files in the working directory but not in the shards:\n` +
        `${verifyResult.missingTestFiles.join('\n')}`,
    )
  }
  core.info(`Verified the consistency of the test files`)
}

const globShardFiles = async (shardsDirectory: string) => {
  const globber = await glob.create(path.join(shardsDirectory, '*'))
  return await globber.glob()
}

const globRelative = async (pattern: string) => {
  const globber = await glob.create(pattern)
  const files = await globber.glob()
  const cwd = process.cwd()
  return files.map((f) => path.relative(cwd, f))
}
