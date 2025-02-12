import * as fs from 'fs'
import * as path from 'path'

export const MAX_GH_GQL_PAGINATION = 100
export const HERE_DIR = './' // assume this is running on the default checkout location
export const GITHUB_WORKFLOWS_REGEX = /\/\.github\/workflows\/[^/]+\.ya?ml$/

/**
 * Mocking node's builtins like fs and path requires a lot of extra steps and is
 * not compatible with jest's hoiking of mock statements when is esm, and import
 * statements are run before the jest.mock(...) calls, which is not conducive to
 * mocking the builtins. Read https://jestjs.io/docs/ecmascript-modules and
 * https://jestjs.io/docs/manual-mocks#mocking-node-modules and you'll know why
 * it's easier to just preempt jest's lack of capacity to mock builtins in esm
 * by creating wrapper functions here.
 */

/**
 * Mockable wrap of fs.readdirSync(path, options?)
 * @param path
 * @param options
 * @returns
 */
export function fs_readDirectory(
  path: fs.PathLike,
  options?:
    | {
        encoding: BufferEncoding | null
        withFileTypes?: false | undefined
        recursive?: boolean | undefined
      }
    | BufferEncoding
    | null
): string[] {
  return fs.readdirSync(path, options)
}

/**
 * Mockable wrap of fs.statSync(path, options?)
 * @param path
 * @param options
 * @returns
 */
export function fs_statSync(path: fs.PathLike, options?: undefined): fs.Stats {
  return fs.statSync(path, options)
}

export function getFilesMatchingRegex(dir: string, regex: RegExp): string[] {
  const files: string[] = []
  function readDirectory(directory: string) {
    const items = fs_readDirectory(directory)
    for (const item of items) {
      const fullPath = path.join(directory, item)
      const stat = fs_statSync(fullPath)
      if (stat.isDirectory()) {
        readDirectory(fullPath)
      } else if (regex.test(item)) {
        files.push(fullPath)
      }
    }
  }
  readDirectory(dir)
  return files
}
