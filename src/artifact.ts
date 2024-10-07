import * as core from '@actions/core'
import { DefaultArtifactClient } from '@actions/artifact'
import { Octokit } from './github'

type Inputs = {
  testReportBranch: string
  testReportArtifactNamePrefix: string
  owner: string
  repo: string
}

export const downloadTestReports = async (octokit: Octokit, inputs: Inputs) => {
  const testReportArtifacts = await findTestReportArtifacts(octokit, inputs)
  if (testReportArtifacts.length === 0) {
    core.warning('No test reports found') //TODO
    return
  }

  const artifactClient = new DefaultArtifactClient()
  for (const testReportArtifact of testReportArtifacts) {
    await artifactClient.downloadArtifact(testReportArtifact.id)
  }
}

const findTestReportArtifacts = async (octokit: Octokit, inputs: Inputs) => {
  const { data: listWorkflowRuns } = await octokit.rest.actions.listWorkflowRunsForRepo({
    owner: inputs.owner,
    repo: inputs.repo,
    branch: inputs.testReportBranch,
    status: 'success',
  })
  for (const workflowRun of listWorkflowRuns.workflow_runs) {
    const listArtifacts = await octokit.paginate(octokit.rest.actions.listWorkflowRunArtifacts, {
      owner: inputs.owner,
      repo: inputs.repo,
      run_id: workflowRun.id,
      per_page: 100,
    })
    core.info(`Found ${listArtifacts.length} artifacts of workflow run ${workflowRun.id} at ${workflowRun.created_at}`)
    const testReportArtifacts = listArtifacts.filter((workflowRunArtifact) =>
      workflowRunArtifact.name.startsWith(inputs.testReportArtifactNamePrefix),
    )
    if (testReportArtifacts.length > 0) {
      return testReportArtifacts
    }
  }
  return []
}
