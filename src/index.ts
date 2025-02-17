import * as core from '@actions/core'
import * as github from '@actions/github'
import { graphql } from '@octokit/graphql'
import { Octokit } from '@octokit/rest'
import { Endpoints, ResponseHeaders } from '@octokit/types'

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'
import { minimatch } from 'minimatch'

import * as utils from './utils.js'
import { Context } from '@actions/github/lib/context.js'

/**
 * A 1:1 of the inputs expected by the action.yml
 */
export type ActionInputs = {
  github_token: string
  trunk_branch: string
  checkout_root: string
  log_event_payload: string
  log_workflow_triggers: string
  inject_diff_paths: string
}

/**
 * Manages getting all the parameter inputs prior to running the action.
 * @returns Promise<ActionInputs | null>
 */
export async function getActionInputs(): Promise<ActionInputs | null> {
  try {
    return {
      trunk_branch: core.getInput('trunk-branch'),
      checkout_root: core.getInput('checkout-root'),
      log_event_payload: core.getInput('log-event-payload'),
      log_workflow_triggers: core.getInput('log-workflow-triggers'),
      inject_diff_paths: core.getInput('inject-diff-paths'),
      github_token: core.getInput('github_token')
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error fetching inputs:', error.message)
      core.setFailed(error.message)
    }
    return null
  }
}

/**
 * Logs the event payload if set to.
 * @param actionInput
 */
function logEventPayload(actionInputs: ActionInputs) {
  // Print the JSON webhook payload for the event that triggered the workflow
  if (actionInputs.log_event_payload != 'false') {
    console.log('The event payload:', JSON.stringify(github.context.payload, undefined, 2))
  }
}

/**
 * Sets the step status to failed if the event that triggered this wasn't a PR.
 * @param eventName
 * @param context
 * @returns
 */
function thisIsntAPullRequestEvent(context: Context): boolean {
  const thisIsntAPR = context.eventName !== 'pull_request' || !context.payload.pull_request
  if (thisIsntAPR) {
    core.setFailed(`dispatch-suggestor can only be run from a pull_request event. Was ${context.eventName} event.`)
  }
  return thisIsntAPR
}

/**
 * Query for the list of files changed by this PR + the graphql API ratelimit
 */
const gql_query_list_PR_files = `
  query($owner: String!, $name: String!, $pullRequestNumber: Int!, $maximumGitHubGraphQLPagination: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $pullRequestNumber) {
        files(first: $maximumGitHubGraphQLPagination) {
          edges {
            node {
              path
              additions
              deletions
              changeType
            }
          }
        }
      }
    }
    rateLimit {
      cost
      remaining
      resetAt
    }
  }
`

/**
 * Type for the graphql generic so TS expects the result from querying with
 * gql_query_list_PR_files parameterised query string.
 */
interface GQLQueryListPRFiles {
  repository: {
    pullRequest: {
      files: {
        edges: {
          node: {
            path: string
            additions: number
            deletions: number
            changeType: string
          }
        }[]
      }
    }
  }
  rateLimit: {
    cost: number
    remaining: number
    resetAt: string
  }
}

/**
 * Retrieve the repository owner from context
 * @param context
 * @returns
 */
function owner(context: Context): string {
  return context.repo.owner
}

/**
 * Retrieve the repository name from context
 * @param context
 * @returns
 */
function repoName(context: Context): string {
  return context.repo.repo
}

/**
 * Retrieve the pull request number from context
 * @param context
 * @returns
 */
function pullRequestNumber(context: Context): number {
  // called only after `if (thisIsntAPullRequestEvent)`
  return context.payload.pull_request!.number
}

/**
 * Retrieve the HEAD ref from context.
 *
 * Used when templating the dispatch trigger URL.
 * @param context
 * @returns
 */
function headRef(context: Context): string {
  // called only after `if (thisIsntAPullRequestEvent)`
  return context.payload.pull_request!.head.ref
}

/**
 * STEP ONE: Get the list of files this PR touches.
 *
 * At the moment this is done with the graphql endpoint. If for some reason that
 * ends up being too frequently used, could add an option to use the rest api
 * instead, but no point implementing both now.
 * @param context
 * @param actionInputs
 * @returns A list of all files changed by this PR.
 */
async function fetchChangedFiles(context: Context, actionInputs: ActionInputs): Promise<string[]> {
  let actualFiles: string[] = []
  let injectedFiles: string[] = []
  try {
    const result = await graphql<GQLQueryListPRFiles>({
      query: gql_query_list_PR_files,
      owner: owner(context),
      name: repoName(context),
      pullRequestNumber: pullRequestNumber(context),
      maximumGitHubGraphQLPagination: utils.MAX_GH_GQL_PAGINATION,
      headers: {
        authorization: `Bearer ${actionInputs.github_token}`
      }
    })
    try {
      actualFiles = result.repository.pullRequest.files.edges.map((edge) => edge.node.path)
      injectedFiles = actionInputs.inject_diff_paths.split(',')
      const rateLimitInfo = result.rateLimit
      console.log('Changed files (actual):', actualFiles)
      console.log('Changed files (inject):', injectedFiles)
      console.log('GraphQL Rate Limit Info:', rateLimitInfo)
      core.notice(`Changed files (actual): ${actualFiles.toString()}`)
      core.notice(`Changed files (inject): ${injectedFiles}`)
      core.notice(`GraphQL Rate Limit Info: ${JSON.stringify(rateLimitInfo)}`)
    } catch (error) {
      console.log('Error, dumping full API Response:', JSON.stringify(result, null, 2))
      throw error // throw error down to the next catch
    }
  } catch (error) {
    console.error('Error fetching changed files:', error)
    core.setFailed(`Error fetching changed files: ${error}`)
  }
  return actualFiles.concat(injectedFiles)
}

/**
 * If the "checkout-root" directory doesn't exist, set failure and return true.
 * @param actionInputs
 * @returns
 */
function theCheckoutRootDirectoryDoesntExist(actionInputs: ActionInputs): boolean {
  const checkoutRootNotExist = !fs.existsSync(actionInputs.checkout_root)
  if (checkoutRootNotExist) {
    core.setFailed(`The specified path in checkout-root doesn't exist: ${actionInputs.checkout_root}`)
  }
  return checkoutRootNotExist
}

/*
 * STEP TWO: Get the set of triggering conditions for all trunk workflows. The
 * rest API for a github_token has a rate limit of 1000/hour/repo. Thats not all
 * that much when this is expected to be geared for a monorepo that could have
 * high double digit to triple digit workflows with frequent pushes. AS SUCH --
 * this parses checked out files '''locally''' i.e. this is expecting the
 * workflow that runs it to have run actions/checkout.
 */

/**
 * Returns the sanitised head ref -- the HEAD branch name.
 * @param context
 * @returns
 */
function headBranch(context: Context): string {
  return utils.sanitiseString(headRef(context))
}

/**
 * Returns the sanitised trunk ref -- the TRUNK branch name.
 * @param actionInputs
 * @returns
 */
function trunkBranch(actionInputs: ActionInputs): string {
  return utils.sanitiseString(actionInputs.trunk_branch)
}

const DWTBP_PREFIX = 'Dispatchable workflow triggered by push:'

function logWhichRefsTriggerWorkflow(
  headWouldTriggerThis: boolean,
  trunkWouldTriggerThis: boolean,
  onRefParseRule: string,
  workflowPath: string,
  context: Context,
  actionInputs: ActionInputs
) {
  if (headWouldTriggerThis) {
    console.log(
      `${DWTBP_PREFIX} on ${onRefParseRule}: Head (this) "${headBranch(context)}" will trigger: ${workflowPath}`
    )
  }
  if (trunkWouldTriggerThis) {
    console.log(
      `${DWTBP_PREFIX} on ${onRefParseRule}: Trunk "${trunkBranch(actionInputs)}" will trigger: ${workflowPath}`
    )
  }
  if (!trunkWouldTriggerThis && !headWouldTriggerThis) {
    console.log(`${DWTBP_PREFIX} on ${onRefParseRule}: Neither trunk nor head would trigger this: ${workflowPath}`)
  }
}

/**
 * The logic for parsing the workflow.on.push.branches. Validates for the HEAD
 * and trunk branch names. TODO: validate for paths.
 * @param workflow
 * @param context
 * @param actionInputs
 * @returns
 */
function thisPushWouldTriggerOnBranches(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workflow: any,
  context: Context,
  actionInputs: ActionInputs
): { head: boolean; trunk: boolean } {
  // Only branches is supposed to be used with the negating case. Check the
  // trunk IS one of the patterns, but also that the triggering headBranch
  // isn't. Branches can start with ! so we have to filter through all.
  let trunkWouldTriggerThis = false
  let headWouldTriggerThis = false
  let positiveCheck: boolean
  let onBranch: string
  const onBranches: string[] = workflow.on.push.branches
  for (const _onBranch of onBranches) {
    // Check each "would trigger" through all triggers in order.
    // First check for inverse condition / sanitise branch
    positiveCheck = _onBranch.slice(0, 1) != '!'
    onBranch = positiveCheck ? _onBranch : _onBranch.slice(1)
    // For both refs, test the pattern against the ref. If the ref
    // matches the pattern, then apply the inverse of the inverse
    // condition. Otherwise leave it as its current value.
    trunkWouldTriggerThis = minimatch(trunkBranch(actionInputs), onBranch) ? positiveCheck : trunkWouldTriggerThis
    headWouldTriggerThis = minimatch(headBranch(context), onBranch) ? positiveCheck : headWouldTriggerThis
  }
  return { head: headWouldTriggerThis, trunk: trunkWouldTriggerThis }
}

/**
 * The logic for parsing the workflow.on.push.branches-ignore. Validates for the
 * HEAD and trunk branch names. TODO: validate for paths.
 * @param workflow
 * @param context
 * @param actionInputs
 * @returns
 */
function thisPushWouldTriggerOnBranchesIgnore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workflow: any,
  context: Context,
  actionInputs: ActionInputs
): { head: boolean; trunk: boolean } {
  // If branches-ignore is present, no need to check for negation.
  const trunkWouldTriggerThis = !workflow.on.push['branches-ignore']
    .map((branch: string) => minimatch(trunkBranch(actionInputs), branch))
    .includes(true)
  const headWouldTriggerThis = !workflow.on.push['branches-ignore']
    .map((branch: string) => minimatch(headBranch(context), branch))
    .includes(true)
  return { head: headWouldTriggerThis, trunk: trunkWouldTriggerThis }
}

/**
 * This just wraps logging and returning false after checking for either
 * branches or branches-ignore. We don't handle tags.
 * @param workflowPath
 * @returns
 */
function thisPushWouldTriggerOnTagsOrTagsIgnore(workflowPath: string): { head: boolean; trunk: boolean } {
  console.log(`${DWTBP_PREFIX} on <tags|tags-ignore>: Ignoring this workflow: ${workflowPath}`)
  return { head: false, trunk: false }
}

/**
 * This just wraps logging and returning true after already exhausting checking
 * for all four of the branches, branches-ignore, tags, and tags-ignore filters.
 * @param workflowPath
 * @returns
 */
function thisPushDoesntIncludeABranchOrTagFilter(workflowPath: string): { head: boolean; trunk: boolean } {
  console.log(`${DWTBP_PREFIX} doesn't specify branch or tag filters: Ignoring this workflow: ${workflowPath}`)
  return { head: true, trunk: true }
}

/**
 * The logic for parsing the workflow.on.push.<branches|branches-ignore>.
 * Returns an object that provides _.head and _.trunk as true if those refs are
 * matched by the ordered globs on the <branches|branches-ignore>, and false if
 * they are not matched, or are negatively matched. Returns false for both if
 * neither the <branches|branches-ignore> field exists, as this does not care
 * about tag refs.
 * @param workflow
 * @param workflowPath
 * @param context
 * @param actionInputs
 * @returns
 */
// https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#onpushbranchestagsbranches-ignoretags-ignore
// Any required from output of yaml.parse
// Runs in a context after already establishing workflow.on.push is non null.
function thisPushWouldTriggerOnAPushToRef(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workflow: any,
  workflowPath: string,
  context: Context,
  actionInputs: ActionInputs
): { head: boolean; trunk: boolean } {
  // 'branches-ignore' and 'branches' are mutually exclusive.
  if ('branches-ignore' in workflow.on.push && workflow.on.push['branches-ignore'] != null) {
    const onBrIgn = thisPushWouldTriggerOnBranchesIgnore(workflow, context, actionInputs)
    logWhichRefsTriggerWorkflow(onBrIgn.head, onBrIgn.trunk, 'branches-ignore', workflowPath, context, actionInputs)
    return onBrIgn
  } else if ('branches' in workflow.on.push && workflow.on.push.branches != null) {
    const onBranches = thisPushWouldTriggerOnBranches(workflow, context, actionInputs)
    logWhichRefsTriggerWorkflow(onBranches.head, onBranches.trunk, 'branches', workflowPath, context, actionInputs)
    return onBranches
  } else if ('tags' in workflow.on.push || 'tags-ignore' in workflow.on.push) {
    return thisPushWouldTriggerOnTagsOrTagsIgnore(workflowPath) // both statically false
  } else {
    return thisPushDoesntIncludeABranchOrTagFilter(workflowPath) // both statically true
  }
}

/**
 * True if any of the changed paths are not ignored by the paths-ignore filter.
 * @param workflow
 * @param listOfChangedFiles
 * @returns
 */
function changedFilesFilteredThisPushPathsIgnore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workflow: any,
  listOfChangedFiles: string[]
): boolean {
  // If paths-ignore is present, no need to check for negation.
  // If any file in the list of changed files is not ignored by one of the
  // ignore globs, then true
  return listOfChangedFiles
    .map((changedFile: string) =>
      // each changed file maps to the rolled up result of testing it against all
      // ignore globs, testing for a true match against any of them.
      workflow.on.push['paths-ignore']
        .map((pathIgnoreGlob: string) => minimatch(changedFile, pathIgnoreGlob))
        .includes(true)
    )
    .includes(false)
  // and finally makes sure that at least one of the changed files DIDN'T match
}

/**
 * True if any of the changed paths filter through all the filtering globs.
 * @param workflow
 * @param listOfChangedFiles
 * @returns
 */
function changedFilesFilteredThisPushPaths(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workflow: any,
  listOfChangedFiles: string[]
): boolean {
  // Only paths is supposed to be used with the negating case.
  const changedFilesPassedFilter: boolean[] = []
  for (let i = 0; i < listOfChangedFiles.length; i += 1) {
    changedFilesPassedFilter.push(false)
  }
  let positiveCheck: boolean
  let pathGlob: string
  for (const _pathGlob of workflow.on.push['paths']) {
    // First check for inverse condition / sanitise path
    positiveCheck = _pathGlob.slice(0, 1) != '!'
    pathGlob = positiveCheck ? _pathGlob : _pathGlob.slice(1)
    for (let i = 0; i < listOfChangedFiles.length; i += 1) {
      console.log(`--debug-- glob "${pathGlob}" matching ${listOfChangedFiles[i]}`)
      console.log(`--debug-- before check ${changedFilesPassedFilter[i]}`)
      // If this changed file name matches the path glob then we update its
      // value to whatever the positive check is, otherwise leave same.
      changedFilesPassedFilter[i] = minimatch(listOfChangedFiles[i], pathGlob)
        ? positiveCheck
        : changedFilesPassedFilter[i]
      console.log(`--debug-- after check ${changedFilesPassedFilter[i]}`)
    }
  }
  return changedFilesPassedFilter.includes(true)
}

/**
 * Aggregates the result of checking both the paths and paths-ignore filters.
 * @param workflow
 * @param workflowPath
 * @param context
 * @param actionInputs
 * @param listOfChangedFiles
 * @returns
 */
// https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#onpushpull_requestpull_request_targetpathspaths-ignore
// Any required from output of yaml.parse
// Runs in a context after already establishing workflow.on.push is non null.
function theChangedFilesMatchThisPushesPathFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workflow: any,
  workflowPath: string,
  context: Context,
  actionInputs: ActionInputs,
  listOfChangedFiles: string[]
): boolean {
  // 'paths-ignore' and 'paths' are mutually exclusive.
  if ('paths-ignore' in workflow.on.push && workflow.on.push['paths-ignore'] != null) {
    const res = changedFilesFilteredThisPushPathsIgnore(workflow, listOfChangedFiles)
    console.log(`${DWTBP_PREFIX} specifies paths-ignore filters: Result was ${res} for: ${workflowPath}`)
    return res
  } else if ('paths' in workflow.on.push && workflow.on.push.paths != null) {
    const res = changedFilesFilteredThisPushPaths(workflow, listOfChangedFiles)
    console.log(`${DWTBP_PREFIX} specifies paths filters: Result was ${res} for: ${workflowPath}`)
    return res
  } else {
    console.log(`${DWTBP_PREFIX} doesn't specify <paths|paths-ignore> filters: Ignoring this workflow: ${workflowPath}`)
    return false
  }
}

/**
 * Right now we only want to comment for dispatchable workflows that would
 * trigger on pushes to the trunk but ignore those that have already been
 * triggered by pushes to the non-trunk headref. This abstraction exists in
 * case later on we want to handle an option to include any branch that will
 * be triggered on the trunk regardless if they have already been triggered.
 * @param triggersOnPushTo
 * @returns
 */
function weWantToMentionThisWorkflowInTheComment(
  triggersOnPushTo: { head: boolean; trunk: boolean },
  triggersOnPushPath: boolean
): boolean {
  // true IFF the trunk is true AND head is false AND paths is true
  return triggersOnPushTo.trunk ? !triggersOnPushTo.head && triggersOnPushPath : false
}

function thisWorkflowPassesTheChecksToAddItToTheComment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workflow: any,
  workflowPath: string,
  context: Context,
  actionInputs: ActionInputs,
  listOfChangedFiles: string[]
): boolean {
  // thisPushWouldTriggerOnAPushToRef will do a more contextualised log
  const triggersOnPushTo = thisPushWouldTriggerOnAPushToRef(workflow, workflowPath, context, actionInputs)
  const triggersOnPushPath = theChangedFilesMatchThisPushesPathFilters(
    workflow,
    workflowPath,
    context,
    actionInputs,
    listOfChangedFiles
  )
  return weWantToMentionThisWorkflowInTheComment(triggersOnPushTo, triggersOnPushPath)
}

function logGHRestAPIRateLimitHeaders(responseHeaders: ResponseHeaders) {
  const ratelimitInfo: { [header: string]: string | number | undefined } = {}
  ratelimitInfo['x-ratelimit-limit'] = responseHeaders['x-ratelimit-limit']
  ratelimitInfo['x-ratelimit-remaining'] = responseHeaders['x-ratelimit-remaining']
  ratelimitInfo['x-ratelimit-reset'] = responseHeaders['x-ratelimit-reset']
  ratelimitInfo['x-ratelimit-resource'] = responseHeaders['x-ratelimit-resource']
  ratelimitInfo['x-ratelimit-used'] = responseHeaders['x-ratelimit-used']
  console.log('REST Rate Limit Info:', ratelimitInfo)
  core.notice(`REST Rate Limit Info: ${JSON.stringify(ratelimitInfo)}`)
}

/**
 * STEP TWO: Get the list of dispatchable workflows that we want to mention.
 *
 * This checks both the locally checkout out workflows and the result of the API
 * for listing workflows, to compile the set of dispatchable workflows, and will
 * return the set of those that we want to mention in the comment.
 * @param context
 * @param actionInputs
 * @returns
 */
async function getDispatchableWorkflows(
  context: Context,
  actionInputs: ActionInputs,
  localWorkflowPaths: { directory: string; paths: string[] },
  // https://docs.github.com/en/rest/actions/workflows?apiVersion=2022-11-28#list-repository-workflows
  workflowsListedByAPI: Endpoints['GET /repos/{owner}/{repo}/actions/workflows']['response'],
  listOfChangedFiles: string[]
): Promise<string[]> {
  try {
    // Remap the API's response
    const workflowsAPI = new Map(workflowsListedByAPI.data.workflows.map((workflow) => [workflow.path, workflow]))
    // Get details of each workflow
    console.log('All workflows LOCAL are ', localWorkflowPaths.paths.toString())
    console.log('All workflows API are ', Array.from(workflowsAPI.keys()).toString())
    const workflowsFound = localWorkflowPaths.paths.filter((x) => workflowsAPI.has(x))
    // We need the paths and root directory supplied separated from calling
    // getFilesMatchingGithubWorkflows so we can match only the part of the
    // paths that matches the workflow regex with the list of workflow paths
    // returned by the API. But we need to glue them back to the whole path
    // for finding and reading the yaml.
    const dispatchableWorkflowsThatRequireInputs: string[] = []
    const dispatchableWorkflowsTriggeredByPush: string[] = []
    const dispatchableWorkflowsTriggeredByPushThatDontRequireInputs = []
    // Iterate over the list of workflows and parse the workflow_dispatch ones.
    for (const workflowPath of workflowsFound) {
      const workflowContent = fs.readFileSync(path.join(localWorkflowPaths.directory, workflowPath), 'utf8')
      const workflow = yaml.parse(workflowContent)
      if ('on' in workflow && 'workflow_dispatch' in workflow.on) {
        ////////////////////////////////////////////////////////////////////
        // Now we are only dealing with dispatchable workflows only.
        ////////////////////////////////////////////////////////////////////
        if (actionInputs.log_workflow_triggers != 'false') {
          console.log(`Workflow Path: ${workflowPath}`)
          if ('name' in workflow) {
            console.log(`Workflow Name: ${workflow.name}`)
          }
          console.log(`On: ${JSON.stringify(workflow.on, null, 2)}`)
        }
        // Check if the dispatch requires inputs, because this is something
        // we can't magically know about. Perhaps a TODO if it ever matters
        // would be to take a map provided to the action as an input that
        // provides values for commonly named inputs, if you have a lot of
        // dispatchables that share common input names and it's desirable
        // for the dispatch link to populate the URL with some predetermined
        // values per known input name. For now their run pages will be
        // included in the comment with a message that they require input.
        if (
          workflow.on.workflow_dispatch != null &&
          'inputs' in workflow.on.workflow_dispatch &&
          workflow.on.workflow_dispatch.inputs != null
        ) {
          // Could test whether each input has <input_id>.required or not!
          // At the moment just consider any input listed as too much.
          dispatchableWorkflowsThatRequireInputs.push(workflowPath)
          console.log(`Dispatchable workflow that takes inputs: ${workflowPath}`)
        }
        // Check and gather all dispatchables that are triggered on push
        if ('push' in workflow.on) {
          if (
            thisWorkflowPassesTheChecksToAddItToTheComment(
              workflow,
              workflowPath,
              context,
              actionInputs,
              listOfChangedFiles
            )
          ) {
            dispatchableWorkflowsTriggeredByPush.push(workflowPath)
          }
        } else {
          console.log(`Dispatchable workflow not triggered by push: ${workflowPath}`)
        }
        for (const dwtbp of dispatchableWorkflowsTriggeredByPush) {
          if (dwtbp in dispatchableWorkflowsThatRequireInputs) {
            console.log(
              `Dispatchable workflow triggered by push but not included because it requires inputs: ${workflowPath}`
            )
          } else {
            dispatchableWorkflowsTriggeredByPushThatDontRequireInputs.push(dwtbp)
          }
        }
        ////////////////////////////////////////////////////////////////////
        // We're now finished parsing dispatchable workflows.
        ////////////////////////////////////////////////////////////////////
      }
    }
    return dispatchableWorkflowsTriggeredByPushThatDontRequireInputs
  } catch (error) {
    console.error('Error fetching workflows:', error)
    core.setFailed(`Error fetching workflows: ${error}`)
    return []
  }
}

/**
 * The function run by the action.
 * @param actionInputs
 * @returns
 */
export async function entrypoint(actionInputs: ActionInputs) {
  try {
    logEventPayload(actionInputs)

    // Grab the context
    const context = github.context

    // If this isn't running under a PR trigger, annotate and leave early
    if (thisIsntAPullRequestEvent(context)) return
    // Even though that func did this already, do it again for ts intellisense
    if (!context.payload.pull_request) return

    // Otherwise, procede as usual, for a pull_request trigger.

    // Prep Rest API
    const ghRestAPI = new Octokit({ auth: `Bearer ${actionInputs.github_token}` })

    // Log the owner, repo and PR#
    console.log('owner:', owner(context))
    console.log('repo:', repoName(context))
    console.log('pullRequestNumber:', pullRequestNumber(context))

    // STEP ONE: Get the list of files changed by this PR.
    const listOfChangedFiles = await fetchChangedFiles(context, actionInputs)
    core.setOutput('list-of-changed-files', listOfChangedFiles)

    // Log the HEAD branch and the trunk branch names, used for checking against
    // the name of each branch in push trigger conditions
    console.log('HEAD branch name:', headBranch(context))
    console.log('TRUNK branch name:', trunkBranch(actionInputs))

    // If the checkout root directory doesn't exist, set failure and exit.
    if (theCheckoutRootDirectoryDoesntExist(actionInputs)) return

    // Get the list of locally checkout out workflows.
    const localWorkflowPaths = utils.getFilesMatchingGithubWorkflows(actionInputs.checkout_root)
    // As well as the set of workflows known to the API.
    const workflowsListedByAPI = await ghRestAPI.actions.listRepoWorkflows({
      owner: owner(context),
      repo: repoName(context)
    })
    logGHRestAPIRateLimitHeaders(workflowsListedByAPI.headers)

    // STEP TWO: Get the list of dispatchable workflows that we want to mention.
    const dispatchableWorkflows = await getDispatchableWorkflows(
      context,
      actionInputs,
      localWorkflowPaths,
      workflowsListedByAPI,
      listOfChangedFiles
    )
    core.setOutput('list-of-dispatchable-workflows', dispatchableWorkflows)

    // TODO NEXT BRANCH: See the line above that also starts with "TODO NEXT BRANCH"
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
