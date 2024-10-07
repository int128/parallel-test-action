import * as core from '@actions/core'
import { getOctokit } from './github'
import { downloadTestReports } from './artifact'

type Inputs = {
  testReportBranch: string
  testReportArtifactNamePrefix: string
  owner: string
  repo: string
  token: string
}

export const run = async (inputs: Inputs): Promise<void> => {
  const octokit = getOctokit(inputs.token)

  core.info(`Downloading test reports on branch ${inputs.testReportBranch}`)
  await downloadTestReports(octokit, inputs)
}
