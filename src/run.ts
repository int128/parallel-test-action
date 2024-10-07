import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as os from 'os'
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

  for (const f of await fs.readdir(testReportDirectory, { withFileTypes: true })) {
    if (f.isFile()) {
      core.info(`- ${f.name}`)
    }
  }
}
