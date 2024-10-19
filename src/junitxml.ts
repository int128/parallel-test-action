import assert from 'assert'
import * as core from '@actions/core'
import * as fs from 'fs/promises'
import * as path from 'path'
import { XMLParser } from 'fast-xml-parser'

type TestFile = {
  filename: string
  totalTime: number
  totalTestCases: number
}

export const parseTestReportFiles = async (testReportFiles: string[]): Promise<TestFile[]> => {
  const junitXmls = await parseTestReportFilesToJunitXml(testReportFiles)
  const allTestCases: TestCase[] = []
  for (const junitXml of junitXmls) {
    const testCases = findTestCasesFromJunitXml(junitXml)
    allTestCases.push(...testCases)
  }
  core.info(`Found ${allTestCases.length} test cases in the test reports`)
  const testFiles = groupTestCasesByTestFile(allTestCases)
  return testFiles
}

export const groupTestCasesByTestFile = (testCases: TestCase[]): TestFile[] => {
  const testFiles = new Map<string, TestFile>()
  for (const testCase of testCases) {
    const testFilename = path.normalize(testCase.filename)
    const currentTestFile = testFiles.get(testFilename) ?? {
      filename: testFilename,
      totalTime: 0,
      totalTestCases: 0,
    }
    currentTestFile.totalTime += testCase.time
    currentTestFile.totalTestCases++
    testFiles.set(testFilename, currentTestFile)
  }
  return [...testFiles.values()]
}

export type TestCase = {
  filename: string
  time: number
}

export const findTestCasesFromJunitXml = (junitXml: JunitXml): TestCase[] => {
  function* visit(testSuite: JunitXmlTestSuite): Generator<TestCase> {
    for (const junitXmlTestCase of testSuite.testcase ?? []) {
      yield {
        filename: junitXmlTestCase['@_file'],
        time: junitXmlTestCase['@_time'],
      }
    }
    for (const nestedTestSuite of testSuite.testsuite ?? []) {
      visit(nestedTestSuite)
    }
  }

  const root = junitXml.testsuites?.testsuite ?? junitXml.testsuite ?? []
  const testCases: TestCase[] = []
  for (const testSuite of root) {
    for (const testCase of visit(testSuite)) {
      testCases.push(testCase)
    }
  }
  return testCases
}

const parseTestReportFilesToJunitXml = async (testReportFiles: string[]): Promise<JunitXml[]> => {
  const junitXmls: JunitXml[] = []
  core.startGroup(`Parsing ${testReportFiles.length} test report files`)
  for (const testReportFile of testReportFiles) {
    core.info(`Parsing the test report: ${testReportFile}`)
    const xml = await fs.readFile(testReportFile)
    const junitXml = parseJunitXml(xml)
    junitXmls.push(junitXml)
  }
  core.endGroup()
  return junitXmls
}

type JunitXml = {
  testsuites?: {
    testsuite?: JunitXmlTestSuite[]
  }
  testsuite?: JunitXmlTestSuite[]
}

function assertJunitXml(x: unknown): asserts x is JunitXml {
  assert(typeof x === 'object', 'Root element must be an object')
  assert(x != null, 'Root element must not be null')

  if ('testsuites' in x) {
    assert(typeof x.testsuites === 'object', 'Element <testsuites> must be an object')
    assert(x.testsuites != null, 'Element <testsuites> must not be null')

    if ('testsuite' in x.testsuites) {
      assert(Array.isArray(x.testsuites.testsuite), 'Element <testsuite> must be an array')
      for (const testsuite of x.testsuites.testsuite) {
        assertTestSuite(testsuite)
      }
    }
  }

  if ('testsuite' in x) {
    assert(Array.isArray(x.testsuite), 'Element <testsuite> must be an array')
    for (const testsuite of x.testsuite) {
      assertTestSuite(testsuite)
    }
  }
}

type JunitXmlTestSuite = {
  testsuite?: JunitXmlTestSuite[]
  testcase?: JunitXmlTestCase[]
}

function assertTestSuite(x: unknown): asserts x is JunitXmlTestSuite {
  assert(typeof x === 'object', 'Element <testsuite> must be an object')
  assert(x != null, 'Element <testsuite> must not be null')
  if ('testsuite' in x) {
    assert(Array.isArray(x.testsuite), 'Element <testsuite> must be an array')
    for (const testsuite of x.testsuite) {
      assertTestSuite(testsuite)
    }
  }
  if ('testcase' in x) {
    assert(Array.isArray(x.testcase), 'Element <testcase> must be an array')
    for (const testcase of x.testcase) {
      assertTestCase(testcase)
    }
  }
}

type JunitXmlTestCase = {
  '@_name': string
  '@_time': number
  '@_file': string
}

function assertTestCase(x: unknown): asserts x is JunitXmlTestCase {
  assert(typeof x === 'object', 'Element <testcase> must be an object')
  assert(x != null, 'Element <testcase> must not be null')
  assert('@_name' in x, 'Element <testcase> must have "name" attribute')
  assert(typeof x['@_name'] === 'string', 'name attribute of <testcase> must be a string')
  assert('@_time' in x, 'Element <testcase> must have "time" attribute')
  assert(typeof x['@_time'] === 'number', 'time attribute of <testcase> must be a number')
  assert('@_file' in x, 'Element <testcase> must have "file" attribute')
  assert(typeof x['@_file'] === 'string', 'file attribute of <testcase> must be a string')
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
