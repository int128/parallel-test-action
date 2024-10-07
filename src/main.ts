import * as core from '@actions/core'
import * as github from '@actions/github'
import { run } from './run.js'
import { getWorkflowFilename } from './github.js'

const main = async (): Promise<void> => {
  await run({
    testReportBranch: core.getInput('test-report-branch', { required: true }),
    testReportArtifactNamePrefix: core.getInput('test-report-artifact-name-prefix', { required: true }),
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    workflowFilename: getWorkflowFilename(),
    token: core.getInput('token', { required: true }),
  })
}

main().catch((e: Error) => {
  core.setFailed(e)
  console.error(e)
})
