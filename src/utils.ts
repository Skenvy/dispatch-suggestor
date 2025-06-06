import * as fs from 'fs'
import * as path from 'path'

export const MAX_GH_GQL_PAGINATION = 100
export const GITHUB_WORKFLOWS_REGEX = /\.github\/workflows\/[^/]+\.ya?ml$/

/**
 * Sanitise a single line string
 * @param str
 */
export function sanitiseString(str: string): string {
  return str.replace(/\n|\r/g, '')
}

/**
 * Returns the directory of a root folder searched within for matches to the
 * regex, and a list of all files under that root folder that matched it.
 * @param dir
 * @param regex
 * @returns
 */
export function getFilesMatchingRegex(dir: string, regex: RegExp): { directory: string; paths: string[] } {
  // Use path.join to sanitise, because it's what we use to generate the full
  // path anyway. It will get rid of any initial './' if that's not the whole
  // path on it's own. It will also ensure "one and only one" trailing '/'.
  const sanitisedDir = path.join(path.join(dir), '/')
  // Path's join can be used to sanitise anything other than the initial paths
  // that represent "here", because it wont discard them from the result until
  // there's more in the path after them, so handle the "here" separately. We
  // want to regex the whole literal sanitised path, but using path.join later
  // during iteration will remove the './' once it adds other paths, so we have
  // to make sure we don't include the literal for './' if that IS the dir.
  const rgx =
    sanitisedDir === './'
      ? new RegExp(String.raw`^${regex.source}`)
      : new RegExp(String.raw`^${sanitisedDir}${regex.source}`)
  const files: string[] = []
  function readDirectory(directory: string) {
    const items = fs.readdirSync(directory)
    for (const item of items) {
      const fullPath = path.join(directory, item)
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        readDirectory(fullPath)
      } else if (rgx.test(fullPath)) {
        // It should have matched using the regex source, so we can now pull the
        // original regex matching end part out and not keep the sanitisedDir,
        // now that we don't need it to regex for the repo root directory.
        const matched = fullPath.match(regex)
        if (matched && matched.length > 0) {
          files.push(matched[0])
        }
      }
    }
  }
  readDirectory(dir)
  return {
    directory: sanitisedDir,
    paths: files
  }
}

/**
 * Returns the root directory searched within for files that match the pattern
 * for github workflows, and a list of all workflow files found.
 * @param dir
 * @returns
 */
export function getFilesMatchingGithubWorkflows(dir: string): { directory: string; paths: string[] } {
  return getFilesMatchingRegex(dir, GITHUB_WORKFLOWS_REGEX)
}
