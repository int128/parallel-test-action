import * as core from '@actions/core'
import { DefaultArtifactClient } from '@actions/artifact'
import { Octokit } from './github'

type Inputs = {
  testReportWorkflow: string
  testReportBranch: string
  testReportArtifactNamePrefix: string
  testReportDirectory: string
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
  for (const testReportArtifact of testReportArtifacts) {
    core.info(
      `- ${testReportArtifact.name} (${testReportArtifact.size_in_bytes} bytes, ${testReportArtifact.created_at})`,
    )
  }

  const artifactClient = new DefaultArtifactClient()
  for (const testReportArtifact of testReportArtifacts) {
    await core.group(`Downloading the artifact: ${testReportArtifact.name}`, () =>
      artifactClient.downloadArtifact(testReportArtifact.id, {
        path: inputs.testReportDirectory,
        findBy: {
          workflowRunId: testReportArtifact.workflowRunId,
          repositoryOwner: inputs.owner,
          repositoryName: inputs.repo,
          token: inputs.token,
        },
      }),
    )
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
  for (const workflowRun of listWorkflowRuns.workflow_runs) {
    core.info(`- ${workflowRun.id} (${workflowRun.created_at}, ${workflowRun.status}) ${workflowRun.url}`)
  }
  for (const workflowRun of listWorkflowRuns.workflow_runs) {
    core.info(`Finding the test reports from workflow run ${workflowRun.id}`)
    const listArtifacts = await octokit.paginate(octokit.rest.actions.listWorkflowRunArtifacts, {
      owner: inputs.owner,
      repo: inputs.repo,
      run_id: workflowRun.id,
      per_page: 100,
    })
    const testReportArtifacts = listArtifacts
      .filter((workflowRunArtifact) => workflowRunArtifact.name.startsWith(inputs.testReportArtifactNamePrefix))
      .map((workflowRunArtifact) => ({
        ...workflowRunArtifact,
        workflowRunId: workflowRun.id,
      }))
    if (testReportArtifacts.length > 0) {
      return testReportArtifacts
    }
  }
  return []
}
