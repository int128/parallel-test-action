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
      shardCount: getIntegerInput('shard-count'),
      averageShardTime: getFloatInput('average-shard-time-seconds'),
      maxShardCount: getIntegerInput('max-shard-count'),
      shardsArtifactName: core.getInput('shards-artifact-name', { required: true }),
      enableSummary: core.getBooleanInput('enable-summary', { required: true }),
      token: core.getInput('token', { required: true }),
    },
    github.getOctokit(),
    github.getContext(),
  )
  await core.summary.write()
  core.setOutput('shards-directory', outputs.shardsDirectory)
  core.setOutput('shards-artifact-name', outputs.shardsArtifactName)
  core.setOutput('shards-json', outputs.shardsJson)
}

const getIntegerInput = (name: string): number | undefined => {
  const s = core.getInput(name)
  if (s === '') {
    return
  }
  const n = Number.parseInt(s, 10)
  if (Number.isSafeInteger(n)) {
    return n
  }
  throw new Error(`Input ${name} must be a valid integer`)
}

const getFloatInput = (name: string): number | undefined => {
  const s = core.getInput(name)
  if (s === '') {
    return
  }
  const n = Number.parseFloat(s)
  if (Number.isFinite(n)) {
    return n
  }
  throw new Error(`Input ${name} must be a valid float`)
}

try {
  await main()
} catch (e) {
  core.setFailed(e instanceof Error ? e : String(e))
  console.error(e)
}
