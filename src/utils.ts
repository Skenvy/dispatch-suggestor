import * as fs from 'fs'
import * as path from 'path'

export const MAX_GH_GQL_PAGINATION = 100
export const HERE_DIR = './' // assume this is running on the default checkout location
export const GITHUB_WORKFLOWS_REGEX = /\/\.github\/workflows\/[^/]+\.ya?ml$/

export function getFilesMatchingRegex(dir: string, regex: RegExp): string[] {
  const files: string[] = []
  function readDirectory(directory: string) {
    const items = fs.readdirSync(directory)
    for (const item of items) {
      const fullPath = path.join(directory, item)
      const stat = fs.statSync(fullPath)
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
