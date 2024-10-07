import * as core from '@actions/core'
import { DefaultArtifactClient } from '@actions/artifact'
import { Octokit } from './github'

type Inputs = {
  testReportWorkflow: string
  testReportBranch: string
  testReportArtifactNamePrefix: string
  owner: string
  repo: string
  token: string
}

export const downloadTestReports = async (octokit: Octokit, inputs: Inputs) => {
  const testReportArtifacts = await findTestReportArtifacts(octokit, inputs)
  if (testReportArtifacts.length === 0) {
    core.warning('No test reports found') //TODO
    return
  }

  const artifactClient = new DefaultArtifactClient()
  for (const testReportArtifact of testReportArtifacts) {
    await artifactClient.downloadArtifact(testReportArtifact.id, {
      findBy: {
        repositoryOwner: inputs.owner,
        repositoryName: inputs.repo,
        token: inputs.token,
        workflowRunId: testReportArtifact.workflow_run?.id ?? 0,
      },
    })
  }
}

const findTestReportArtifacts = async (octokit: Octokit, inputs: Inputs) => {
  const { data: listWorkflowRuns } = await octokit.rest.actions.listWorkflowRuns({
    owner: inputs.owner,
    repo: inputs.repo,
    workflow_id: inputs.testReportWorkflow,
    branch: inputs.testReportBranch,
    status: 'success',
  })
  core.info(
    `Found ${listWorkflowRuns.workflow_runs.length} workflow runs of ${inputs.testReportWorkflow} on branch ${inputs.testReportBranch}`,
  )
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
