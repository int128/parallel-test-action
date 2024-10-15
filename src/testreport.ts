import { parseTestReportFiles } from './junitxml'

type TestWorkflowRun = {
  testReportFiles: string[]
}

type TestFile = {
  filename: string
  totalTime: number
  totalTestCases: number
}

export const parseTestReportsOfWorkflowRuns = async (testWorkflowRuns: TestWorkflowRun[]): Promise<TestFile[]> => {
  const testFilesOfWorkflowRuns: TestFile[][] = []
  for (const testWorkflowRun of testWorkflowRuns) {
    const testFiles = await parseTestReportFiles(testWorkflowRun.testReportFiles)
    testFilesOfWorkflowRuns.push(testFiles)
  }
  return calculateAveregedTestFiles(testFilesOfWorkflowRuns)
}

const calculateAveregedTestFiles = (testFilesOfWorkflowRuns: TestFile[][]): TestFile[] => {
  const testFileMap = new Map<
    string,
    TestFile & {
      effectiveWorkflowRuns: number
    }
  >()
  for (const testFilesOfWorkflowRun of testFilesOfWorkflowRuns) {
    for (const testFile of testFilesOfWorkflowRun) {
      const currentTestFile = testFileMap.get(testFile.filename) ?? {
        filename: testFile.filename,
        totalTime: 0,
        totalTestCases: 0,
        effectiveWorkflowRuns: 0,
      }
      currentTestFile.totalTime += testFile.totalTime
      currentTestFile.totalTestCases += testFile.totalTestCases
      currentTestFile.effectiveWorkflowRuns++
      testFileMap.set(testFile.filename, currentTestFile)
    }
  }
  for (const [, testFile] of testFileMap) {
    testFile.totalTime /= testFile.effectiveWorkflowRuns
    testFile.totalTestCases /= testFile.effectiveWorkflowRuns
  }
  return [...testFileMap.values()]
}
