import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { getOctokit } from './github'
import { downloadTestReports } from './artifact'
import { parseJunitXml } from './junitxml'
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

export const run = async (inputs: Inputs): Promise<void> => {
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

  for (const testReportFile of testReportFiles) {
    const xml = await fs.readFile(testReportFile)
    const junitXml = parseJunitXml(xml)
    core.info(`Parsed ${testReportFile}: ${JSON.stringify(junitXml, null, 2)}`)
  }

  // TODO
  const shards = generateShards([], inputs.shardCount)

  const shardsDirectory = path.join(tempDirectory, 'shards')
  await writeShardsWithLeaderElection(shards, shardsDirectory, inputs.shardsArtifactName)
}
