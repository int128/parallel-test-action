import * as core from '@actions/core'
import * as fs from 'fs/promises'
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
  assignedShardId?: number
}

class Shard {
  readonly id: number
  totalTime: number = 0
  totalTestCases: number = 0
  readonly testFiles: WorkingTestFile[] = []

  constructor(id: number) {
    this.id = id
  }

  add(testFile: WorkingTestFile): void {
    this.totalTime += testFile.totalTime
    this.totalTestCases += testFile.totalTestCases
    this.testFiles.push(testFile)
  }
}

const createShards = (count: number): Shard[] =>
  Array(count)
    .fill(null)
    .map((_, index) => new Shard(index + 1))

export type ShardSet = {
  shards: Shard[]
  workingTestFiles: WorkingTestFile[]
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
    workingTestFile.assignedShardId = leastShard.id
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

export const tryDownloadShards = async (shardsDirectory: string, shardsArtifactName: string) => {
  const artifactClient = new DefaultArtifactClient()
  let existingArtifact
  try {
    existingArtifact = await artifactClient.getArtifact(shardsArtifactName)
  } catch (e) {
    if (e instanceof ArtifactNotFoundError) {
      return false
    }
    throw e
  }
  core.info(`Another job has locked the shards`)
  await core.group(`Downloading the artifact: ${shardsArtifactName}`, () =>
    artifactClient.downloadArtifact(existingArtifact.artifact.id, { path: shardsDirectory }),
  )
  return true
}

type Lock = {
  currentJobAcquiredLock: boolean
}

export const writeShardsWithLock = async (
  shards: Shard[],
  shardsDirectory: string,
  shardsArtifactName: string,
): Promise<Lock> => {
  const artifactClient = new DefaultArtifactClient()

  core.info(`Acquiring a lock of shards`)
  const shardFilenames = await writeShards(shards, shardsDirectory)
  const conflictError = await core.group(`Uploading the artifact: ${shardsArtifactName}`, () =>
    catchHttp409ConflictError(async () => {
      await artifactClient.uploadArtifact(shardsArtifactName, shardFilenames, shardsDirectory)
    }),
  )
  if (!conflictError) {
    core.info(`This job acquired the lock of shards`)
    return { currentJobAcquiredLock: true }
  }

  core.info(`Another job has locked the shards: ${conflictError}`)
  core.info(`This job will download the existing shards`)
  // For eventual consistency, GetArtifact may return ArtifactNotFoundError just after UploadArtifact.
  const existingArtifact = await retryArtifactNotFoundError(() => artifactClient.getArtifact(shardsArtifactName))
  await fs.rm(shardsDirectory, { recursive: true })
  await core.group(`Downloading the artifact: ${shardsArtifactName}`, () =>
    artifactClient.downloadArtifact(existingArtifact.artifact.id, { path: shardsDirectory }),
  )
  return { currentJobAcquiredLock: false }
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
  for (const shard of shards) {
    const shardFilename = path.join(directory, `${shard.id}`)
    const content = shard.testFiles.map((f) => f.filename).join('\n')
    await fs.writeFile(shardFilename, content)
    shardFilenames.push(shardFilename)
  }
  return shardFilenames
}
