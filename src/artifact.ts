import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as path from 'path'
import { ArtifactClient, DefaultArtifactClient } from '@actions/artifact'
import { Octokit } from './github'

type Inputs = {
  testReportWorkflowFilename: string
  testReportArtifactNamePrefix: string
  testReportBranch: string
  testReportDirectory: string
  owner: string
  repo: string
  token: string
}

export type TestWorkflowRun = {
  url: string
  testReportFiles: string[]
}

export const downloadTestReportsFromLastWorkflowRuns = async (
  octokit: Octokit,
  inputs: Inputs,
): Promise<TestWorkflowRun | undefined> => {
  const lastWorkflowRuns = await findLastWorkflowRuns(octokit, inputs)
  if (lastWorkflowRuns.length === 0) {
    return
  }
  const lastWorkflowRun = lastWorkflowRuns[0]
  const artifactClient = new DefaultArtifactClient()
  const testReportFiles = await downloadTestReportArtifacts(octokit, artifactClient, inputs, lastWorkflowRun.id)
  return {
    url: lastWorkflowRun.html_url,
    testReportFiles,
  }
}

const findLastWorkflowRuns = async (octokit: Octokit, inputs: Inputs) => {
  core.info(`Finding the last success workflow run on ${inputs.testReportBranch} branch`)
  const { data: listWorkflowRuns } = await octokit.rest.actions.listWorkflowRuns({
    owner: inputs.owner,
    repo: inputs.repo,
    workflow_id: inputs.testReportWorkflowFilename,
    branch: inputs.testReportBranch,
    status: 'success',
    per_page: 1,
  })
  core.info(`Found ${listWorkflowRuns.workflow_runs.length} workflow run:`)
  for (const lastWorkflowRun of listWorkflowRuns.workflow_runs) {
    core.info(`- ${lastWorkflowRun.id} (${lastWorkflowRun.created_at}) ${lastWorkflowRun.url}`)
  }
  return listWorkflowRuns.workflow_runs
}

const downloadTestReportArtifacts = async (
  octokit: Octokit,
  artifactClient: ArtifactClient,
  inputs: Inputs,
  workflowRunId: number,
) => {
  core.info(`Finding the artifacts of the last workflow run`)
  const listArtifacts = await octokit.paginate(octokit.rest.actions.listWorkflowRunArtifacts, {
    owner: inputs.owner,
    repo: inputs.repo,
    run_id: workflowRunId,
    per_page: 100,
  })
  core.info(`Found ${listArtifacts.length} artifacts:`)
  for (const workflowRunArtifact of listArtifacts) {
    core.info(
      `- ${workflowRunArtifact.name} (${workflowRunArtifact.size_in_bytes} bytes, ${workflowRunArtifact.created_at})`,
    )
  }
  const testReportArtifacts = listArtifacts.filter((workflowRunArtifact) =>
    workflowRunArtifact.name.startsWith(inputs.testReportArtifactNamePrefix),
  )
  core.info(`Filtered ${testReportArtifacts.length} artifacts of the test reports`)

  for (const testReportArtifact of testReportArtifacts) {
    await core.group(`Downloading the artifact: ${testReportArtifact.name}`, () =>
      artifactClient.downloadArtifact(testReportArtifact.id, {
        path: path.join(inputs.testReportDirectory, `${workflowRunId}`, testReportArtifact.name),
        findBy: {
          workflowRunId: workflowRunId,
          repositoryOwner: inputs.owner,
          repositoryName: inputs.repo,
          token: inputs.token,
        },
      }),
    )
  }
  const testReportGlobber = await glob.create(path.join(inputs.testReportDirectory, `${workflowRunId}`, '*', '*.xml'))
  const testReportFiles = await testReportGlobber.glob()
  return testReportFiles
}
