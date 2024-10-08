import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as glob from '@actions/glob'
import * as path from 'path'
import { ArtifactNotFoundError, DefaultArtifactClient } from '@actions/artifact'

type ReportedTestFile = {
  filename: string
  totalTime: number
  totalTestCases: number
}

type WorkingTestFile = {
  filename: string
  existsInTestReports: boolean
  totalTime: number
  totalTestCases: number
}

class Shard {
  totalTime: number = 0
  totalTestCases: number = 0
  readonly testFiles: WorkingTestFile[] = []

  add(testFile: WorkingTestFile): void {
    this.totalTime += testFile.totalTime
    this.totalTestCases += testFile.totalTestCases
    this.testFiles.push(testFile)
  }
}

const createShards = (count: number): Shard[] =>
  Array(count)
    .fill(null)
    .map(() => new Shard())

type ShardSet = {
  shards: Shard[]
  workingTestFiles: WorkingTestFile[]
}

export const writeShardSummary = (shardSet: ShardSet) => {
  core.summary.addHeading('parallel-test-action')
  core.summary.addHeading('Shards', 2)
  core.summary.addTable([
    [
      { data: 'Index', header: true },
      { data: 'Test files', header: true },
      { data: 'Estimated test cases', header: true },
      { data: 'Estimated time (s)', header: true },
    ],
    ...shardSet.shards.map((shard, i) => [
      `#${i + 1}`,
      `${shard.testFiles.length}`,
      `${shard.totalTestCases}`,
      shard.totalTime.toFixed(1),
    ]),
  ])

  core.summary.addHeading('Test files in the working directory', 2)
  core.summary.addTable([
    [
      { data: 'Test file', header: true },
      { data: 'Test cases', header: true },
      { data: 'Total time (s)', header: true },
    ],
    ...shardSet.workingTestFiles.map((f) =>
      f.existsInTestReports
        ? [f.filename, `${f.totalTestCases}`, f.totalTime.toFixed(1)]
        : [f.filename, '-', `${f.totalTime.toFixed(1)} (no report)`],
    ),
  ])
}

export const generateShards = (
  workingTestFilenames: string[],
  reportedTestFiles: ReportedTestFile[],
  shardCount: number,
): ShardSet => {
  const workingTestFiles = estimateWorkingTestFiles(workingTestFilenames, reportedTestFiles)
  sortByTime(workingTestFiles).reverse()

  const shards = createShards(shardCount)
  for (const workingTestFile of workingTestFiles) {
    sortByTime(shards)
    const leastShard = shards[0]
    leastShard.add(workingTestFile)
  }
  return { shards, workingTestFiles }
}

const estimateWorkingTestFiles = (
  workingTestFilenames: string[],
  reportedTestFiles: ReportedTestFile[],
): WorkingTestFile[] => {
  const averageTime = averageOf(reportedTestFiles.map((f) => f.totalTime))
  const reportedTestFileByName = new Map(reportedTestFiles.map((f) => [f.filename, f]))

  const workingTestFiles = []
  for (const workingTestFilename of workingTestFilenames) {
    const reportedTestFile = reportedTestFileByName.get(workingTestFilename)
    workingTestFiles.push({
      filename: workingTestFilename,
      existsInTestReports: reportedTestFile !== undefined,
      // If the test file does not exist in the test reports, we assume the average time.
      totalTime: reportedTestFile?.totalTime ?? averageTime,
      totalTestCases: reportedTestFile?.totalTestCases ?? 1,
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

type LeaderElection = {
  shardFilenames: string[]
  leader: boolean
}

export const writeShardsWithLeaderElection = async (
  shards: Shard[],
  shardsDirectory: string,
  shardsArtifactName: string,
): Promise<LeaderElection> => {
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
    return {
      shardFilenames,
      leader: true,
    }
  }

  core.info(`Another job has the leadership: ${uploadArtifactError}`)
  core.info(`Finding the shards of the leader`)
  // For eventual consistency, GetArtifact may return ArtifactNotFoundError just after UploadArtifact.
  const existingArtifact = await retryArtifactNotFoundError(() => artifactClient.getArtifact(shardsArtifactName))
  await fs.rm(shardsDirectory, { recursive: true })
  await core.group(`Downloading the artifact: ${shardsArtifactName}`, () =>
    artifactClient.downloadArtifact(existingArtifact.artifact.id, { path: shardsDirectory }),
  )
  const shardGlobber = await glob.create(path.join(shardsDirectory, '*'))
  return {
    shardFilenames: await shardGlobber.glob(),
    leader: false,
  }
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

const retryArtifactNotFoundError = async <T>(f: () => Promise<T>): Promise<T> => {
  const maxAttempt = 10
  const intervalSec = 3
  for (let i = 0; ; i++) {
    try {
      return await f()
    } catch (e) {
      if (e instanceof ArtifactNotFoundError) {
        if (i >= maxAttempt) {
          throw e
        }
        core.info(`Retrying after ${intervalSec}s: ${String(e)}`)
        await new Promise((resolve) => setTimeout(resolve, intervalSec * 1000))
        continue
      }
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
