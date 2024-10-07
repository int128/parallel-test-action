import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { getOctokit } from './github'
import { downloadTestReports } from './artifact'

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
  await downloadTestReports(octokit, {
    testReportBranch: inputs.testReportBranch,
    testReportArtifactNamePrefix: inputs.testReportArtifactNamePrefix,
    testReportWorkflow: inputs.workflowFilename,
    testReportDirectory,
    owner: inputs.owner,
    repo: inputs.repo,
    token: inputs.token,
  })

  const xmlGlobber = await glob.create(path.join(testReportDirectory, '**/*.xml'))
  for await (const xml of xmlGlobber.globGenerator()) {
    core.info(`Found the test report: ${xml}`)
  }
}
