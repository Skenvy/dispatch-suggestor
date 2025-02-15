export declare const MAX_GH_GQL_PAGINATION = 100;
export declare const GITHUB_WORKFLOWS_REGEX: RegExp;
export declare function getFilesMatchingRegex(dir: string, regex: RegExp): {
    directory: string;
    paths: string[];
};
