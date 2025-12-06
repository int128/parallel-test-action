import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as core from '@actions/core'
import { XMLParser } from 'fast-xml-parser'
import * as z from 'zod'

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
    const currentTestFile = testFiles.get(testCase.filename) ?? {
      filename: testCase.filename,
      totalTime: 0,
      totalTestCases: 0,
    }
    currentTestFile.totalTime += testCase.time
    currentTestFile.totalTestCases++
    testFiles.set(testCase.filename, currentTestFile)
  }
  return [...testFiles.values()]
}

export type TestCase = {
  filename: string
  time: number
}

export const findTestCasesFromJunitXml = (junitXml: JunitXml): TestCase[] => {
  const rootTestSuites: JunitXmlTestSuite[] = junitXml.testsuites?.testsuite ?? junitXml.testsuite ?? []

  function* visit(testSuite: JunitXmlTestSuite): Generator<TestCase> {
    const determineTestCaseFilename = (junitXmlTestCase: JunitXmlTestCase): string => {
      if (junitXmlTestCase['@_file']) {
        return junitXmlTestCase['@_file']
      }
      // For Mocha or Cypress, the first <testsuite> element has the filename of the root suite.
      const mochaRootSuiteFilename = rootTestSuites.at(0)?.['@_file']
      if (mochaRootSuiteFilename) {
        return mochaRootSuiteFilename
      }
      throw new Error(`Element <testcase> must have "file" attribute (name=${junitXmlTestCase['@_name']})`)
    }

    for (const junitXmlTestCase of testSuite.testcase ?? []) {
      yield {
        filename: path.normalize(determineTestCaseFilename(junitXmlTestCase)),
        time: junitXmlTestCase['@_time'],
      }
    }
    for (const nestedTestSuite of testSuite.testsuite ?? []) {
      visit(nestedTestSuite)
    }
  }

  const testCases: TestCase[] = []
  for (const testSuite of rootTestSuites) {
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

const JunitXmlTestCase = z.object({
  '@_name': z.string(),
  '@_time': z.number(),
  '@_file': z.string().optional(),
})

type JunitXmlTestCase = z.infer<typeof JunitXmlTestCase>

const JunitXmlTestSuite = z.object({
  get testsuite() {
    return z.array(JunitXmlTestSuite).optional()
  },
  testcase: z.array(JunitXmlTestCase).optional(),
  '@_file': z.string().optional(),
})

type JunitXmlTestSuite = z.infer<typeof JunitXmlTestSuite>

const JunitXml = z.object({
  testsuites: z
    .object({
      testsuite: z.array(JunitXmlTestSuite).optional(),
    })
    .optional(),
  testsuite: z.array(JunitXmlTestSuite).optional(),
})

type JunitXml = z.infer<typeof JunitXml>

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
  const parsed = parser.parse(xml)
  return JunitXml.parse(parsed)
}
