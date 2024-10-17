import { parseTestReportFiles } from './junitxml'

type TestReportsOfWorkflowRun = {
  testReportFiles: string[]
}

type TestFile = {
  filename: string
  totalTime: number
  totalTestCases: number
}

export const parseTestReportsOfWorkflowRuns = async (
  testReportsOfWorkflowRuns: TestReportsOfWorkflowRun[],
): Promise<TestFile[]> => {
  const testFilesOfWorkflowRuns: TestFile[][] = []
  for (const testReportsOfWorkflowRun of testReportsOfWorkflowRuns) {
    const testFiles = await parseTestReportFiles(testReportsOfWorkflowRun.testReportFiles)
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
