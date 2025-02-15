export declare const MAX_GH_GQL_PAGINATION = 100;
export declare const GITHUB_WORKFLOWS_REGEX: RegExp;
/**
 * Returns the directory of a root folder searched within for matches to the
 * regex, and a list of all files under that root folder that matched it.
 * @param dir
 * @param regex
 * @returns
 */
export declare function getFilesMatchingRegex(dir: string, regex: RegExp): {
    directory: string;
    paths: string[];
};
/**
 * Returns the root directory searched within for files that match the pattern
 * for github workflows, and a list of all workflow files found.
 * @param dir
 * @returns
 */
export declare function getFilesMatchingGithubWorkflows(dir: string): {
    directory: string;
    paths: string[];
};
