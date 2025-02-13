import * as fs from 'fs'
import * as path from 'path'

export const MAX_GH_GQL_PAGINATION = 100
export const GITHUB_WORKFLOWS_REGEX = /\.github\/workflows\/[^/]+\.ya?ml$/

export function getFilesMatchingRegex(dir: string, regex: RegExp): string[] {
  const sanitisedDir = dir.slice(-1) === '/' ? dir.slice(0, -1) : dir
  const files: string[] = []
  function readDirectory(directory: string) {
    const items = fs.readdirSync(directory)
    const rgx =
      sanitisedDir === '.' ? new RegExp(String.raw`^${regex}`) : new RegExp(String.raw`^${sanitisedDir}/${regex}`)
    for (const item of items) {
      const fullPath = path.join(directory, item)
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        readDirectory(fullPath)
      } else if (rgx.test(fullPath)) {
        files.push(fullPath)
      }
    }
  }
  readDirectory(dir)
  return files
}
