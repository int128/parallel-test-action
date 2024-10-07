import * as fs from 'fs/promises'
import * as path from 'path'
import { parseJunitXml } from '../src/junitxml'

describe('parseJunitXml', () => {
  it('should parse fixture.xml', async () => {
    const xml = await fs.readFile(path.join(__dirname, 'fixture.xml'))
    expect(() => parseJunitXml(xml)).not.toThrow()
  })
})
