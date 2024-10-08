import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as glob from '@actions/glob'
import * as path from 'path'
import { DefaultArtifactClient } from '@actions/artifact'

type TestFile = {
  filename: string
  totalTime: number
  totalTestCases: number
}

export class Shard {
  totalTime: number = 0
  totalTestCases: number = 0
  readonly testFiles: TestFile[] = []

  add(testFile: TestFile): void {
    this.totalTime += testFile.totalTime
    this.totalTestCases += testFile.totalTestCases
    this.testFiles.push(testFile)
  }
}

const createShards = (count: number): Shard[] =>
  Array(count)
    .fill(null)
    .map(() => new Shard())

export const generateShards = (
  workingTestFilenames: string[],
  reportedTestFiles: TestFile[],
  shardCount: number,
): Shard[] => {
  const workingTestFiles = estimateWorkingTestFiles(workingTestFilenames, reportedTestFiles)
  sortByTime(workingTestFiles).reverse()

  const shards = createShards(shardCount)
  for (const workingTestFile of workingTestFiles) {
    sortByTime(shards)
    const leastShard = shards[0]
    leastShard.add(workingTestFile)
  }
  return shards
}

const estimateWorkingTestFiles = (workingTestFilenames: string[], reportedTestFiles: TestFile[]): TestFile[] => {
  const averageTime = averageOf(reportedTestFiles.map((f) => f.totalTime))
  const averageTestCases = Math.ceil(averageOf(reportedTestFiles.map((f) => f.totalTestCases)))
  const reportedTestFileByName = new Map(reportedTestFiles.map((f) => [f.filename, f]))

  const workingTestFiles = []
  for (const workingTestFilename of workingTestFilenames) {
    const reportedTestFile = reportedTestFileByName.get(workingTestFilename)
    workingTestFiles.push({
      filename: workingTestFilename,
      // If the test file does not exist in the test reports, we assume the average time.
      totalTime: reportedTestFile?.totalTime ?? averageTime,
      totalTestCases: reportedTestFile?.totalTestCases ?? averageTestCases,
    })
  }
  return workingTestFiles
}

const averageOf = (a: number[]) => {
  if (a.length === 0) {
    return 0
  }
  return a.reduce((x, y) => x + y, 0) / a.length
}

const sortByTime = <E extends { totalTime: number }>(shards: E[]) => shards.sort((a, b) => a.totalTime - b.totalTime)

export const writeShardsWithLeaderElection = async (
  shards: Shard[],
  shardsDirectory: string,
  shardsArtifactName: string,
) => {
  const artifactClient = new DefaultArtifactClient()

  core.info(`Acquiring the leadership of shards`)
  const shardFilenames = await writeShards(shards, shardsDirectory)
  const uploadArtifactError = await core.group(`Uploading the artifact: ${shardsArtifactName}`, () =>
    catchHttp409ConflictError(async () => {
      await artifactClient.uploadArtifact(shardsArtifactName, shardFilenames, shardsDirectory)
    }),
  )
  if (!uploadArtifactError) {
    core.info(`This job becomes the leader`)
    return shardFilenames
  }

  core.info(`Another job has the leadership: ${uploadArtifactError}`)
  core.info(`Finding the shards of the leader`)
  const existingArtifact = await artifactClient.getArtifact(shardsArtifactName)
  await fs.rm(shardsDirectory, { recursive: true })
  await core.group(`Downloading the artifact: ${shardsArtifactName}`, () =>
    artifactClient.downloadArtifact(existingArtifact.artifact.id, { path: shardsDirectory }),
  )
  const shardGlobber = await glob.create(path.join(shardsDirectory, '*'))
  return await shardGlobber.glob()
}

const catchHttp409ConflictError = async (f: () => Promise<void>): Promise<undefined | Error> => {
  try {
    await f()
    return
  } catch (e) {
    if (e instanceof Error && e.message.includes('409')) {
      return e
    } else {
      throw e
    }
  }
}

const writeShards = async (shards: Shard[], directory: string): Promise<string[]> => {
  await fs.mkdir(directory, { recursive: true })
  const shardFilenames = []
  for (const [index, shard] of shards.entries()) {
    const shardFilename = path.join(directory, `${index + 1}`)
    const content = shard.testFiles.map((f) => f.filename).join('\n')
    await fs.writeFile(shardFilename, content)
    shardFilenames.push(shardFilename)
  }
  return shardFilenames
}
