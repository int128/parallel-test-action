import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as glob from '@actions/glob'
import * as path from 'path'
import { DefaultArtifactClient } from '@actions/artifact'

type TestFile = {
  filename: string
  totalTime: number
}

export class Shard {
  totalTime: number = 0
  readonly testFiles: TestFile[] = []

  add(testFile: TestFile): void {
    this.totalTime += testFile.totalTime
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
  const averageTime = averageOf(reportedTestFiles.map((f) => f.totalTime))
  const reportedTestFileByName = new Map(reportedTestFiles.map((f) => [f.filename, f]))

  const workingTestFiles = workingTestFilenames.map((workingTestFilename): TestFile => {
    const reportedTestFile = reportedTestFileByName.get(workingTestFilename)
    if (reportedTestFile === undefined) {
      // If the test file does not exist in the test reports, we assume the average time.
      return {
        filename: workingTestFilename,
        totalTime: averageTime,
      }
    }
    return {
      filename: workingTestFilename,
      totalTime: reportedTestFile.totalTime,
    }
  })
  sortByTime(workingTestFiles).reverse()

  const shards = createShards(shardCount)
  for (const workingTestFile of workingTestFiles) {
    sortByTime(shards)
    const leastShard = shards[0]
    leastShard.add(workingTestFile)
  }
  return shards
}

const averageOf = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length

const sortByTime = (shards: { totalTime: number }[]) => shards.sort((a, b) => a.totalTime - b.totalTime)

export const writeShardsWithLeaderElection = async (
  shards: Shard[],
  shardsDirectory: string,
  shardsArtifactName: string,
) => {
  const artifactClient = new DefaultArtifactClient()

  core.info(`Acquiring the leadership of shards`)
  const shardFilenames = await writeShards(shards, shardsDirectory)
  const uploadArtifactError = await core.group(`Uploading artifact ${shardsArtifactName}`, () =>
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
  await core.group(`Downloading artifact ${shardsArtifactName} of the leader`, () =>
    artifactClient.downloadArtifact(existingArtifact.artifact.id, { path: shardsDirectory }),
  )
  const shardGlobber = await glob.create(path.join(shardsDirectory, '**/*'))
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
