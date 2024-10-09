import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as glob from '@actions/glob'
import * as os from 'os'
import * as path from 'path'
import { getOctokit } from './github'
import { downloadLastTestReports } from './artifact'
import { findTestCasesFromTestReportFiles, groupTestCasesByTestFile } from './junitxml'
import { tryDownloadShardsIfAlreadyExists, distributeTestFilesToShards, writeShardsWithLock } from './shard'
import { writeSummary } from './summary'

type Inputs = {
  workingDirectory: string
  testFiles: string
  testReportBranch: string
  testReportArtifactNameRegExp: string
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
    await showListofShardFiles(shardsDirectory)
    return { shardsDirectory }
  }

  const testReportDirectory = path.join(tempDirectory, 'test-reports')
  const testReportSet = await downloadLastTestReports(octokit, {
    testReportBranch: inputs.testReportBranch,
    testReportArtifactNameRegExp: new RegExp(inputs.testReportArtifactNameRegExp),
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

  await showListofShardFiles(shardsDirectory)
  return { shardsDirectory }
}

const showListofShardFiles = async (shardsDirectory: string) => {
  const globber = await glob.create(path.join(shardsDirectory, '*'))
  const files = await globber.glob()
  core.info(`Available ${files.length} shard files:`)
  for (const f of files) {
    core.info(`- ${f}`)
  }
}

const globRelative = async (pattern: string) => {
  const globber = await glob.create(pattern)
  const files = await globber.glob()
  const cwd = process.cwd()
  return files.map((f) => path.relative(cwd, f))
}
