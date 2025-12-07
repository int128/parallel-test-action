import * as core from '@actions/core'
import * as github from './github.js'
import { run } from './run.js'

const main = async () => {
  const outputs = await run(
    {
      workingDirectory: core.getInput('working-directory', { required: true }),
      testFiles: core.getInput('test-files', { required: true }),
      testReportArtifactNamePrefix: core.getInput('test-report-artifact-name-prefix', { required: true }),
      testReportBranch: core.getInput('test-report-branch', { required: true }),
      shardCount: parseInt(core.getInput('shard-count', { required: true }), 10),
      shardsArtifactName: core.getInput('shards-artifact-name', { required: true }),
      token: core.getInput('token', { required: true }),
    },
    github.getOctokit(),
    github.getContext(),
  )
  await core.summary.write()
  core.setOutput('shards-directory', outputs.shardsDirectory)
}

try {
  await main()
} catch (e) {
  core.setFailed(e instanceof Error ? e : String(e))
  console.error(e)
}
