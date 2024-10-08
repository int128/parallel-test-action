import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { getOctokit } from './github'
import { downloadTestReports } from './artifact'
import { findTestCases, groupTestCasesByTestFile, parseJunitXml } from './junitxml'
import { generateShards, writeShardsWithLeaderElection } from './shard'

type Inputs = {
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
  const octokit = getOctokit(inputs.token)
  const tempDirectory = await fs.mkdtemp(`${process.env.RUNNER_TEMP || os.tmpdir()}/parallel-test-action-`)

  const testReportDirectory = path.join(tempDirectory, 'test-reports')
  const testReportFiles = await downloadTestReports(octokit, {
    testReportBranch: inputs.testReportBranch,
    testReportArtifactNamePrefix: inputs.testReportArtifactNamePrefix,
    testReportWorkflow: inputs.workflowFilename,
    testReportDirectory,
    owner: inputs.owner,
    repo: inputs.repo,
    token: inputs.token,
  })

  const allTestCases = []
  for (const testReportFile of testReportFiles) {
    const xml = await fs.readFile(testReportFile)
    const junitXml = parseJunitXml(xml)
    const testCases = findTestCases(junitXml)
    allTestCases.push(...testCases)
  }
  core.info(`Found ${allTestCases.length} test cases`)

  const testFiles = groupTestCasesByTestFile(allTestCases)
  const shards = generateShards(testFiles, inputs.shardCount)

  const shardsDirectory = path.join(tempDirectory, 'shards')
  await writeShardsWithLeaderElection(shards, shardsDirectory, inputs.shardsArtifactName)

  return { shardsDirectory }
}
