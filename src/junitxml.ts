import assert from 'assert'
import * as core from '@actions/core'
import * as fs from 'fs/promises'
import { XMLParser } from 'fast-xml-parser'

export type JunitXml = {
  testsuites?: {
    testsuite?: TestSuite[]
  }
  testsuite?: TestSuite[]
}

function assertJunitXml(x: unknown): asserts x is JunitXml {
  assert(typeof x === 'object')
  assert(x != null)

  if ('testsuites' in x) {
    assert(typeof x.testsuites === 'object')
    assert(x.testsuites != null)

    if ('testsuite' in x.testsuites) {
      assert(Array.isArray(x.testsuites.testsuite))
      for (const testsuite of x.testsuites.testsuite) {
        assertTestSuite(testsuite)
      }
    }
  }

  if ('testsuite' in x) {
    assert(Array.isArray(x.testsuite))
    for (const testsuite of x.testsuite) {
      assertTestSuite(testsuite)
    }
  }
}

export type TestSuite = {
  testsuite?: TestSuite[]
  testcase?: TestCase[]
}

function assertTestSuite(x: unknown): asserts x is TestSuite {
  assert(typeof x === 'object')
  assert(x != null)
  if ('testsuite' in x) {
    assert(Array.isArray(x.testsuite))
    for (const testsuite of x.testsuite) {
      assertTestSuite(testsuite)
    }
  }
  if ('testcase' in x) {
    assert(Array.isArray(x.testcase))
    for (const testcase of x.testcase) {
      assertTestCase(testcase)
    }
  }
}

export type TestCase = {
  '@_name': string
  '@_time': number
  '@_file': string
}

function assertTestCase(x: unknown): asserts x is TestCase {
  assert(typeof x === 'object')
  assert(x != null)
  assert('@_name' in x)
  assert(typeof x['@_name'] === 'string')
  assert('@_time' in x)
  assert(typeof x['@_time'] === 'number')
  assert('@_file' in x)
  assert(typeof x['@_file'] === 'string')
}

export const parseJunitXml = (xml: string | Buffer): JunitXml => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    isArray: (_: string, jPath: string): boolean => {
      const elementName = jPath.split('.').pop()
      return elementName === 'testsuite' || elementName === 'testcase'
    },
    attributeValueProcessor: (attrName: string, attrValue: string, jPath: string) => {
      const elementName = jPath.split('.').pop()
      if (
        (elementName === 'testsuites' || elementName === 'testsuite' || elementName === 'testcase') &&
        attrName === 'time'
      ) {
        return Number(attrValue)
      }
      return attrValue
    },
  })
  const parsed: unknown = parser.parse(xml)
  assertJunitXml(parsed)
  return parsed
}

export const findTestCases = (junitXml: JunitXml): TestCase[] => {
  const testCases: TestCase[] = []
  const visit = (testSuite: TestSuite): void => {
    for (const testCase of testSuite.testcase ?? []) {
      testCases.push(testCase)
    }
    for (const nestedTestSuite of testSuite.testsuite ?? []) {
      visit(nestedTestSuite)
    }
  }

  const root = junitXml.testsuites?.testsuite ?? junitXml.testsuite ?? []
  for (const testSuite of root) {
    visit(testSuite)
  }
  return testCases
}

type TestFile = {
  filename: string
  totalTime: number
  totalTestCases: number
}

export const groupTestCasesByTestFile = (testCases: TestCase[]): TestFile[] => {
  const testFiles = new Map<string, TestFile>()
  for (const testCase of testCases) {
    const currentTestFile = testFiles.get(testCase['@_file']) ?? {
      filename: testCase['@_file'],
      totalTime: 0,
      totalTestCases: 0,
    }
    currentTestFile.totalTime += testCase['@_time']
    currentTestFile.totalTestCases++
    testFiles.set(testCase['@_file'], currentTestFile)
  }
  return [...testFiles.values()]
}

export const aggregateTestReports = async (testReportFiles: string[]): Promise<TestFile[]> => {
  const allTestCases = []
  for (const testReportFile of testReportFiles) {
    core.info(`Parsing the test report: ${testReportFile}`)
    const xml = await fs.readFile(testReportFile)
    const junitXml = parseJunitXml(xml)
    const testCases = findTestCases(junitXml)
    allTestCases.push(...testCases)
  }
  core.info(`Found ${allTestCases.length} test cases in the test reports`)

  return groupTestCasesByTestFile(allTestCases)
}
