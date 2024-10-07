import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as os from 'os'
import { getOctokit } from './github'
import { downloadTestReports } from './artifact'
import { parseJunitXml } from './junitxml'

type Inputs = {
  testReportBranch: string
  testReportArtifactNamePrefix: string
  owner: string
  repo: string
  workflowFilename: string
  token: string
}

export const run = async (inputs: Inputs): Promise<void> => {
  const octokit = getOctokit(inputs.token)

  const testReportDirectory = await fs.mkdtemp(`${process.env.RUNNER_TEMP || os.tmpdir()}/parallel-test-action-`)
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
}
