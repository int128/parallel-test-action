import assert from 'assert'
import * as github from '@actions/github'
import { retry } from '@octokit/plugin-retry'

export type Octokit = ReturnType<typeof github.getOctokit>

export const getOctokit = (token: string): Octokit => github.getOctokit(token, {}, retry)

export const getWorkflowFilename = () => {
  assert(process.env.GITHUB_WORKFLOW_REF)
  const workflowRefMatcher = process.env.GITHUB_WORKFLOW_REF.match(/([^/]+?)@/)
  assert(workflowRefMatcher)
  assert(workflowRefMatcher.length > 0)
  return workflowRefMatcher[1]
}
