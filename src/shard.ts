import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as path from 'path'
import { DefaultArtifactClient, InvalidResponseError } from '@actions/artifact'

type TestFile = {
  filename: string
  totalTime: number
}

export class Shard {
  private _estimatedTime: number = 0
  readonly testFiles: TestFile[] = []

  get estimatedTime() {
    return this._estimatedTime
  }

  add(testFile: TestFile): void {
    this._estimatedTime += testFile.totalTime
    this.testFiles.push(testFile)
  }
}

const createShards = (count: number): Shard[] =>
  Array(count)
    .fill(null)
    .map(() => new Shard())

export const generateShards = (
  workingTestFilenames: string[],
  testFileEstimations: TestFile[],
  shardCount: number,
): Shard[] => {
  const averageTestFileTime = average(testFileEstimations.map((f) => f.totalTime))
  const workingTestFiles = workingTestFilenames.map((workingTestFilename) => {
    const estimation = testFileEstimations.find((f) => f.filename === workingTestFilename)
    return {
      filename: workingTestFilename,
      totalTime: estimation?.totalTime ?? averageTestFileTime,
    }
  })

  const shards = createShards(shardCount)
  for (const workingTestFile of workingTestFiles) {
    sortShardsByEstimatedTime(shards)
    const leastShard = shards[0]
    leastShard.add(workingTestFile)
  }
  return shards
}

const average = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length

const sortShardsByEstimatedTime = (shards: Shard[]) => shards.sort((a, b) => a.estimatedTime - b.estimatedTime)

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
    if (e instanceof InvalidResponseError) {
      core.warning(`Another job is leader. Trying to download it.\n${String(e)}`)
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
