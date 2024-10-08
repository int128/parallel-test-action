import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as path from 'path'
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

export const downloadLastTestReports = async (octokit: Octokit, inputs: Inputs) => {
  const lastWorkflowRun = await findLastWorkflowRun(octokit, inputs)
  if (lastWorkflowRun === undefined) {
    return []
  }
  const testReportArtifacts = await findTestReportArtifacts(octokit, inputs, lastWorkflowRun.id)
  if (testReportArtifacts.length === 0) {
    return []
  }

  const artifactClient = new DefaultArtifactClient()
  for (const testReportArtifact of testReportArtifacts) {
    await core.group(`Downloading the artifact: ${testReportArtifact.name}`, () =>
      artifactClient.downloadArtifact(testReportArtifact.id, {
        path: path.join(inputs.testReportDirectory, testReportArtifact.name),
        findBy: {
          workflowRunId: lastWorkflowRun.id,
          repositoryOwner: inputs.owner,
          repositoryName: inputs.repo,
          token: inputs.token,
        },
      }),
    )
  }
  const testReportGlobber = await glob.create(path.join(inputs.testReportDirectory, '**/*.xml'))
  return await testReportGlobber.glob()
}

const findLastWorkflowRun = async (octokit: Octokit, inputs: Inputs) => {
  core.info(`Finding the last success workflow run on ${inputs.testReportBranch} branch`)
  const { data: listWorkflowRuns } = await octokit.rest.actions.listWorkflowRuns({
    owner: inputs.owner,
    repo: inputs.repo,
    workflow_id: inputs.testReportWorkflow,
    branch: inputs.testReportBranch,
    status: 'success',
    per_page: 1,
  })
  if (listWorkflowRuns.workflow_runs.length === 0) {
    return
  }
  const lastWorkflowRun = listWorkflowRuns.workflow_runs[0]
  core.info(`Found the last workflow run:`)
  core.info(`- ${lastWorkflowRun.id} (${lastWorkflowRun.created_at}) ${lastWorkflowRun.url}`)
  return lastWorkflowRun
}

const findTestReportArtifacts = async (octokit: Octokit, inputs: Inputs, lastWorkflowRunId: number) => {
  core.info(`Finding the artifacts of the last workflow run`)
  const listArtifacts = await octokit.paginate(octokit.rest.actions.listWorkflowRunArtifacts, {
    owner: inputs.owner,
    repo: inputs.repo,
    run_id: lastWorkflowRunId,
    per_page: 100,
  })
  if (listArtifacts.length === 0) {
    return []
  }
  core.info(`Found the artifacts:`)
  for (const workflowRunArtifact of listArtifacts) {
    core.info(
      `- ${workflowRunArtifact.name} (${workflowRunArtifact.size_in_bytes} bytes, ${workflowRunArtifact.created_at})`,
    )
  }
  const testReportArtifacts = listArtifacts.filter((workflowRunArtifact) =>
    workflowRunArtifact.name.startsWith(inputs.testReportArtifactNamePrefix),
  )
  core.info(`Filtered ${testReportArtifacts.length} artifacts of the test reports`)
  return testReportArtifacts
}
