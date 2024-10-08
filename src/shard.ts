import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as path from 'path'
import { DefaultArtifactClient } from '@actions/artifact'

type TestFile = {
  file: string
  time: number
}

export class Shard {
  private _estimatedTime: number = 0
  readonly testFiles: TestFile[] = []

  get estimatedTime() {
    return this._estimatedTime
  }

  add(testFile: TestFile): void {
    this._estimatedTime += testFile.time
    this.testFiles.push(testFile)
  }
}

export const generateShards = (testFiles: TestFile[], shardCount: number): Shard[] => {
  const shards = Array.from({ length: shardCount }, () => new Shard())
  const sortedTestFiles = testFiles.slice().sort((a, b) => a.time - b.time)
  for (const testFile of sortedTestFiles) {
    const shard = shards.reduce((a, b) => (a.estimatedTime < b.estimatedTime ? a : b))
    shard.add(testFile)
  }
  return shards
}

export const writeShardsWithLeaderElection = async (
  shards: Shard[],
  directory: string,
  artifactName: string,
): Promise<void> => {
  const artifactClient = new DefaultArtifactClient()
  await writeShards(shards, directory)
  try {
    await core.group(`Uploading artifact ${artifactName}`, () =>
      artifactClient.uploadArtifact(artifactName, [directory], directory),
    )
    return
  } catch (e) {
    core.warning(`Another job is leader. Trying to download it.\n${String(e)}`)
  }

  await fs.rm(directory, { recursive: true })
  const existingArtifact = await artifactClient.getArtifact(artifactName)
  await core.group(`Downloading artifact ${artifactName}`, () =>
    artifactClient.downloadArtifact(existingArtifact.artifact.id, { path: directory }),
  )
}

const writeShards = async (shards: Shard[], directory: string): Promise<void> => {
  await fs.mkdir(directory, { recursive: true })
  for (const [index, shard] of shards.entries()) {
    const shardFilename = path.join(directory, `${index + 1}`)
    await fs.writeFile(shardFilename, shard.testFiles.join('\n'))
  }
}
