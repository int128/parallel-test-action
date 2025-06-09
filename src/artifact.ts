import assert from 'assert'
import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as glob from '@actions/glob'
import * as path from 'path'
import { ArtifactClient, DefaultArtifactClient } from '@actions/artifact'
import { Context } from './github.js'
import { Octokit } from '@octokit/action'

type Inputs = {
  testReportArtifactNamePrefix: string
  testReportBranch: string
  testReportDirectory: string
  token: string
}

export type TestWorkflowRun = {
  url: string
  testReportFiles: string[]
}

export const downloadTestReportsFromLastWorkflowRuns = async (
  octokit: Octokit,
  context: Context,
  inputs: Inputs,
): Promise<TestWorkflowRun | undefined> => {
  const artifactClient = new DefaultArtifactClient()
  const lastWorkflowRuns = await findLastWorkflowRuns(inputs.testReportBranch, octokit, context)
  for (const lastWorkflowRun of lastWorkflowRuns) {
    const testReportFiles = await downloadTestReportArtifacts(
      octokit,
      context,
      artifactClient,
      inputs,
      lastWorkflowRun.id,
    )
    if (testReportFiles.length > 0) {
      core.info(`Found the valid test reports at ${lastWorkflowRun.html_url}`)
      return {
        url: lastWorkflowRun.html_url,
        testReportFiles,
      }
    }
  }
}

const findLastWorkflowRuns = async (branch: string, octokit: Octokit, context: Context) => {
  const workflowFilename = getWorkflowFilename(context)
  core.info(`Finding the last success workflow runs of ${workflowFilename} on ${branch} branch`)
  const { data: listWorkflowRuns } = await octokit.rest.actions.listWorkflowRuns({
    owner: context.repo.owner,
    repo: context.repo.repo,
    workflow_id: workflowFilename,
    branch: branch,
    status: 'success',
    per_page: 10,
  })
  core.startGroup(`Found ${listWorkflowRuns.workflow_runs.length} workflow runs`)
  for (const lastWorkflowRun of listWorkflowRuns.workflow_runs) {
    core.info(`- ${lastWorkflowRun.id} (${lastWorkflowRun.created_at}) ${lastWorkflowRun.html_url}`)
  }
  core.endGroup()
  return listWorkflowRuns.workflow_runs
}

const getWorkflowFilename = (context: Context) => {
  const workflowRefMatcher = context.workflowRef.match(/([^/]+?)@/)
  assert(workflowRefMatcher)
  assert(workflowRefMatcher.length > 0)
  return workflowRefMatcher[1]
}

const downloadTestReportArtifacts = async (
  octokit: Octokit,
  context: Context,
  artifactClient: ArtifactClient,
  inputs: Inputs,
  workflowRunId: number,
) => {
  core.info(`Finding the artifacts of the workflow run ${workflowRunId}`)
  const workflowRunArtifacts = await octokit.paginate(octokit.rest.actions.listWorkflowRunArtifacts, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    run_id: workflowRunId,
    per_page: 100,
  })
  core.info(`Found ${workflowRunArtifacts.length} artifacts of the workflow run ${workflowRunId}`)

  const testReportArtifacts = workflowRunArtifacts.filter(
    (artifact) => !artifact.expired && artifact.name.startsWith(inputs.testReportArtifactNamePrefix),
  )
  core.info(`Found ${testReportArtifacts.length} test report artifacts:`)
  for (const artifact of testReportArtifacts) {
    core.info(`- ${artifact.name} (${artifact.size_in_bytes} bytes, ${artifact.created_at})`)
  }

  await fs.rm(inputs.testReportDirectory, { recursive: true, force: true })
  for (const artifact of testReportArtifacts) {
    await core.group(`Downloading the artifact ${artifact.name} from the workflow run ${workflowRunId}`, () =>
      artifactClient.downloadArtifact(artifact.id, {
        path: path.join(inputs.testReportDirectory, `${workflowRunId}`, artifact.name),
        findBy: {
          workflowRunId: workflowRunId,
          repositoryOwner: context.repo.owner,
          repositoryName: context.repo.repo,
          // This depends on @actions/github to call the Download Artifact API.
          token: inputs.token,
        },
      }),
    )
  }
  const testReportGlobber = await glob.create(path.join(inputs.testReportDirectory, `${workflowRunId}`, '*', '*.xml'))
  const testReportFiles = await testReportGlobber.glob()
  return testReportFiles
}
