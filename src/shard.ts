import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as path from 'path'
import { DefaultArtifactClient, NetworkError } from '@actions/artifact'

type TestFile = {
  filename: string
  totalTime: number
}

export class Shard {
  private _totalTime: number = 0
  readonly testFiles: TestFile[] = []

  get totalTime() {
    return this._totalTime
  }

  add(testFile: TestFile): void {
    this._totalTime += testFile.totalTime
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

  const shards = createShards(shardCount)
  for (const workingTestFile of workingTestFiles) {
    sortShardsByTime(shards)
    const leastShard = shards[0]
    leastShard.add(workingTestFile)
  }
  return shards
}

const averageOf = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length

const sortShardsByTime = (shards: Shard[]) => shards.sort((a, b) => a.totalTime - b.totalTime)

export const leaderElect = async (
  shards: Shard[],
  shardsDirectory: string,
  shardsArtifactName: string,
): Promise<void> => {
  const shardFilenames = await writeShards(shards, shardsDirectory)
  const artifactClient = new DefaultArtifactClient()
  try {
    await core.group(`Uploading artifact ${shardsArtifactName}`, () =>
      artifactClient.uploadArtifact(shardsArtifactName, shardFilenames, shardsDirectory),
    )
    return
  } catch (e) {
    if (e instanceof NetworkError) {
      core.warning(`Another job is leader. Trying to download it.\n${e.code}\n${String(e)}`)
    } else {
      throw e
    }
  }

  await fs.rm(shardsDirectory, { recursive: true })
  const existingArtifact = await artifactClient.getArtifact(shardsArtifactName)
  await core.group(`Downloading artifact ${shardsArtifactName}`, () =>
    artifactClient.downloadArtifact(existingArtifact.artifact.id, { path: shardsDirectory }),
  )
}

const writeShards = async (shards: Shard[], directory: string): Promise<string[]> => {
  core.info(`Writing shards:`)
  await fs.mkdir(directory, { recursive: true })
  const shardFilenames = []
  for (const [index, shard] of shards.entries()) {
    const shardFilename = path.join(directory, `${index + 1}`)
    await fs.writeFile(shardFilename, shard.testFiles.join('\n'))
    shardFilenames.push(shardFilename)
    core.info(`- ${shardFilename}`)
  }
  return shardFilenames
}
