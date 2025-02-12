// ESM Mocking is a acid trip.
import { jest } from '@jest/globals'

// First load from the fixtures.
import * as fs from '../fixtures/fs'

// Then mock the actual import with identity factory.
jest.unstable_mockModule('fs', () => fs)

// Then load the UUT
const { getFilesMatchingRegex, GITHUB_WORKFLOWS_REGEX } = await import('../../src/utils')

/**
 * This is a set of data objects that can be used to construct mocks.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace MockData {
  // eslint-disable-next-line jest/no-export
  export const fs_readDirectory = new Map<string, string[]>([
    ['/test-dir', ['file1.txt', 'file2.yaml', 'subdir']],
    ['/test-dir/subdir', ['file3.yml', 'file4.js']]
  ])
  // eslint-disable-next-line jest/no-export
  export const fs_statSync = new Map<string, { isDirectory: () => boolean }>([
    ['/test-dir', { isDirectory: () => true }],
    ['/test-dir/file1.txt', { isDirectory: () => false }],
    ['/test-dir/file2.yaml', { isDirectory: () => false }],
    ['/test-dir/subdir', { isDirectory: () => true }],
    ['/test-dir/subdir/file3.yml', { isDirectory: () => false }],
    ['/test-dir/subdir/file4.js', { isDirectory: () => false }]
  ])
}

describe('getFilesMatchingRegex', () => {
  beforeEach(() => {
    fs.readdirSync.mockImplementation((dir: string) => MockData.fs_readDirectory.get(dir) || [])
    fs.statSync.mockImplementation((filePath: string) => MockData.fs_statSync.get(filePath) || {})
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
