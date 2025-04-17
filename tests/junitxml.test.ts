import { describe } from 'vitest'
import { it } from 'vitest'
import { expect } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import {
  findTestCasesFromJunitXml,
  groupTestCasesByTestFile,
  parseJunitXml,
  parseTestReportFiles,
  TestCase,
} from '../src/junitxml.js'

describe('parseTestReportFiles', () => {
  it('should parse rspec.xml', async () => {
    const testReportFiles = [path.join(__dirname, 'fixtures/rspec1.xml'), path.join(__dirname, 'fixtures/rspec2.xml')]
    const testFiles = await parseTestReportFiles(testReportFiles)
    expect(testFiles).toEqual([
      { filename: 'spec/a_spec.rb', totalTime: 3, totalTestCases: 2 },
      { filename: 'spec/b_spec.rb', totalTime: 12, totalTestCases: 3 },
      { filename: 'spec/c_spec.rb', totalTime: 13, totalTestCases: 2 },
    ])
  })

  it('should parse cypress.xml', async () => {
    const testReportFiles = [
      path.join(__dirname, 'fixtures/cypress1.xml'),
      path.join(__dirname, 'fixtures/cypress2.xml'),
    ]
    const testFiles = await parseTestReportFiles(testReportFiles)
    expect(testFiles).toEqual([
      { filename: 'cypress/a_spec.ts', totalTime: 6, totalTestCases: 3 },
      { filename: 'cypress/b_spec.ts', totalTime: 4, totalTestCases: 1 },
    ])
  })
})

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
