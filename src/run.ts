import assert from 'assert'
import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as glob from '@actions/glob'
import * as path from 'path'
import { Context } from './github.js'
import { Octokit } from '@octokit/action'
import { downloadTestReportsFromLastWorkflowRuns } from './artifact.js'
import { parseTestReportFiles } from './junitxml.js'
import { writeSummary } from './summary.js'
import {
  tryDownloadShardsIfAlreadyExists,
  distributeTestFilesToShards,
  writeShardsWithLock,
  verifyTestFiles,
} from './shard.js'

type Inputs = {
  workingDirectory: string
  testFiles: string
  testReportArtifactNamePrefix: string
  testReportBranch: string
  shardCount: number
  shardsArtifactName: string
  token: string // downloadArtifact() of @actions/artifact requires a token
}

type Outputs = {
  shardsDirectory: string
}

export const run = async (inputs: Inputs, octokit: Octokit, context: Context): Promise<Outputs> => {
  process.chdir(inputs.workingDirectory)
  const workingTestFilenames = await globRelative(inputs.testFiles)
  core.info(`Found ${workingTestFilenames.length} test files in the working directory`)

  const tempDirectory = await fs.mkdtemp(`${context.runnerTemp}/parallel-test-action-`)
  const shardsDirectory = path.join(tempDirectory, 'shards')

  // Since multiple jobs run in parallel, another job may have already uploaded the shards.
  if (await tryDownloadShardsIfAlreadyExists(shardsDirectory, inputs.shardsArtifactName)) {
    await ensureTestFilesConsistency(shardsDirectory, workingTestFilenames)
    return { shardsDirectory }
  }

  const testReportDirectory = path.join(tempDirectory, 'test-reports')
  const testWorkflowRun = await downloadTestReportsFromLastWorkflowRuns(octokit, context, {
    testReportArtifactNamePrefix: inputs.testReportArtifactNamePrefix,
    testReportBranch: inputs.testReportBranch,
    testReportWorkflowFilename: getWorkflowFilename(context),
    testReportDirectory,
    token: inputs.token,
  })
  const testFiles = await parseTestReportFiles(testWorkflowRun?.testReportFiles ?? [])

  const shardSet = distributeTestFilesToShards(workingTestFilenames, testFiles, inputs.shardCount)
  core.info(`Generated ${shardSet.shards.length} shards`)

  const shardsLock = await writeShardsWithLock(shardSet.shards, shardsDirectory, inputs.shardsArtifactName)
  if (shardsLock.currentJobAcquiredLock) {
    writeSummary(shardSet, testWorkflowRun)
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

const getWorkflowFilename = (context: Context) => {
  const workflowRefMatcher = context.workflowRef.match(/([^/]+?)@/)
  assert(workflowRefMatcher)
  assert(workflowRefMatcher.length > 0)
  return workflowRefMatcher[1]
}
