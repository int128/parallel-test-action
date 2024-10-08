import * as core from '@actions/core'
import * as github from '@actions/github'
import { run } from './run.js'
import { getWorkflowFilename } from './github.js'

const main = async (): Promise<void> => {
  const outputs = await run({
    testReportBranch: core.getInput('test-report-branch', { required: true }),
    testReportArtifactNamePrefix: core.getInput('test-report-artifact-name-prefix', { required: true }),
    shardCount: parseInt(core.getInput('shard-count', { required: true })),
    shardsArtifactName: core.getInput('shards-artifact-name', { required: true }),
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    workflowFilename: getWorkflowFilename(),
    token: core.getInput('token', { required: true }),
  })
  core.setOutput('shards-directory', outputs.shardsDirectory)
}

main().catch((e: Error) => {
  core.setFailed(e)
  console.error(e)
})
