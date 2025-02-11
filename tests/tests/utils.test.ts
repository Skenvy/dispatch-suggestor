'use strict'

jest.mock('fs')
jest.mock('path')

const { getFilesMatchingRegex, GITHUB_WORKFLOWS_REGEX } = await import('../../src/utils.js')

describe('getFilesMatchingRegex', () => {
  const mockFiles = new Map<string, string[]>([
    ['/test-dir', ['file1.txt', 'file2.yaml', 'subdir']],
    ['/test-dir/subdir', ['file3.yml', 'file4.js']]
  ])

  const mockStats = new Map<string, { isDirectory: () => boolean }>([
    ['/test-dir', { isDirectory: () => true }],
    ['/test-dir/file1.txt', { isDirectory: () => false }],
    ['/test-dir/file2.yaml', { isDirectory: () => false }],
    ['/test-dir/subdir', { isDirectory: () => true }],
    ['/test-dir/subdir/file3.yml', { isDirectory: () => false }],
    ['/test-dir/subdir/file4.js', { isDirectory: () => false }]
  ])

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('fs').__setMockFiles(mockFiles)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('fs').__setMockStats(mockStats)
    // (fs.readdirSync as jest.Mock) .mockImplementation((dir: string) => mockFiles.get(dir) || [])
    // (fs.statSync as jest.Mock).mockImplementation((filePath: string) => mockStats.get(filePath) || {})
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should return files matching the regex pattern', () => {
    const result = getFilesMatchingRegex('/test-dir', GITHUB_WORKFLOWS_REGEX)
    expect(result).toEqual(['/test-dir/file2.yaml', '/test-dir/subdir/file3.yml'])
  })

  it('should return an empty array if no files match the regex pattern', () => {
    const result = getFilesMatchingRegex('/test-dir', /\.json$/)
    expect(result).toEqual([])
  })
})

// eslint-disable-next-line jest/no-export
export {}
