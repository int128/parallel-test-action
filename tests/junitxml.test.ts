import * as fs from 'fs/promises'
import * as path from 'path'
import { findTestCasesFromJunitXml, groupTestCasesByTestFile, parseJunitXml, TestCase } from '../src/junitxml'

describe('parseJunitXml', () => {
  it('should parse fixture.xml', async () => {
    const xml = await fs.readFile(path.join(__dirname, 'fixtures/fixture.xml'))
    expect(() => parseJunitXml(xml)).not.toThrow()
  })
})

describe('findTestCasesFromJunitXml', () => {
  it('should return test cases', () => {
    const junitXml = {
      testsuite: [
        {
          testcase: [
            { '@_name': 'test1', '@_time': 1, '@_file': 'file1' },
            { '@_name': 'test2', '@_time': 2, '@_file': 'file2' },
            { '@_name': 'test3', '@_time': 3, '@_file': 'file1' },
          ],
        },
        {
          testcase: [
            { '@_name': 'test4', '@_time': 4, '@_file': 'file2' },
            { '@_name': 'test5', '@_time': 5, '@_file': 'file3' },
          ],
        },
      ],
    }
    expect(findTestCasesFromJunitXml(junitXml)).toEqual<TestCase[]>([
      { filename: 'file1', time: 1 },
      { filename: 'file2', time: 2 },
      { filename: 'file1', time: 3 },
      { filename: 'file2', time: 4 },
      { filename: 'file3', time: 5 },
    ])
  })

  it('should normalize file paths', () => {
    const junitXml = {
      testsuite: [
        {
          testcase: [
            { '@_name': 'test1', '@_time': 1, '@_file': 'file1' },
            { '@_name': 'test2', '@_time': 2, '@_file': './file2' },
            { '@_name': 'test3', '@_time': 3, '@_file': './file1' },
          ],
        },
      ],
    }
    expect(findTestCasesFromJunitXml(junitXml)).toEqual<TestCase[]>([
      { filename: 'file1', time: 1 },
      { filename: 'file2', time: 2 },
      { filename: 'file1', time: 3 },
    ])
  })
})

describe('groupTestCasesByTestFile', () => {
  it('should group test cases by file', () => {
    const testCases: TestCase[] = [
      { filename: 'file1', time: 1 },
      { filename: 'file2', time: 2 },
      { filename: 'file1', time: 3 },
      { filename: 'file2', time: 4 },
      { filename: 'file3', time: 5 },
    ]
    expect(groupTestCasesByTestFile(testCases)).toEqual([
      { filename: 'file1', totalTime: 4, totalTestCases: 2 },
      { filename: 'file2', totalTime: 6, totalTestCases: 2 },
      { filename: 'file3', totalTime: 5, totalTestCases: 1 },
    ])
  })
})
