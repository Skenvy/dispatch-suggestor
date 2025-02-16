import * as core from '@actions/core'
import * as github from '@actions/github'
import { graphql } from '@octokit/graphql'
import { Octokit } from '@octokit/rest'

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'
import { minimatch } from 'minimatch'

import * as utils from './utils.js'

async function run() {
  try {
    // Get the JSON webhook payload for the event that triggered the workflow
    if (core.getInput('log-event-payload') != 'false') {
      console.log('The event payload:', JSON.stringify(github.context.payload, undefined, 2))
    }

    const context = github.context
    const eventName = context.eventName

    // If this isn't running under a PR trigger, annotate and leave early
    if (eventName !== 'pull_request' || !context.payload.pull_request) {
      core.setFailed(
        `dispatch-suggestor can only be run from a pull_request event, but it was triggered by a ${eventName} event.`
      )
      return
    }

    // Otherwise, procede as usual.

    // Prep the token and Rest API
    const token = core.getInput('github_token')
    const ghRestAPI = new Octokit({
      auth: `Bearer ${token}`
    })

    // Prep the owner, repo and PR#
    async function getPRNumber() {
      return context.payload.pull_request ? context.payload.pull_request.number : null
    }

    const owner = context.repo.owner
    const repo = context.repo.repo
    const pullRequestNumber = await getPRNumber()
    console.log('owner:', owner)
    console.log('repo:', repo)
    console.log('pullRequestNumber:', pullRequestNumber)

    // STEP ONE: Get the list of files this PR touches
    // At the moment this is done with the graphql endpoint. If for some reason
    // that ends up being too frequently used, could add an option to use the
    // rest api instead, but no point implementing both now.

    // Query for acquiring the list of files changed by this PR + the graphql API ratelimit
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

    // Type for the graphql generic so TS expects the result from the above query
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

    // Get the list of files changed by this PR.
    async function fetchChangedFiles(): Promise<string[]> {
      let files: string[] = []
      try {
        const result = await graphql<GQLQueryListPRFiles>({
          query: gql_query_list_PR_files,
          owner,
          name: repo,
          pullRequestNumber,
          maximumGitHubGraphQLPagination: utils.MAX_GH_GQL_PAGINATION,
          headers: {
            authorization: `Bearer ${token}`
          }
        })
        try {
          files = result.repository.pullRequest.files.edges.map((edge) => edge.node.path)
          const rateLimitInfo = result.rateLimit
          console.log('Changed files:', files)
          console.log('GraphQL Rate Limit Info:', rateLimitInfo)
          core.notice(`Changed files: ${files.toString()}`)
          core.notice(`GraphQL Rate Limit Info: ${JSON.stringify(rateLimitInfo)}`)
        } catch (error) {
          console.log('Full API Response:', JSON.stringify(result, null, 2))
          throw error // throw error down to the next catch
        }
      } catch (error) {
        console.error('Error fetching changed files:', error)
        core.setFailed(`Error fetching changed files: ${error}`)
      }
      return files
    }

    const files = await fetchChangedFiles()
    core.setOutput('list-of-changed-files', files)

    // STEP TWO: Get the set of triggering conditions for all trunk workflows.
    // The rest API for a github_token has a rate limit of 1000/hour/repo. Thats
    // not all that much when this is expected to be geared for a monorepo that
    // could have high double digit to triple digit workflows with frequent
    // pushes. AS SUCH -- this parses checked out files '''locally''' i.e. this
    // is expecting the workflow that runs it to have run actions/checkout.

    const headBranch = utils.sanitiseString(context.payload.pull_request.head.ref) // use when templating the dispatch trigger URL
    const trunkBranch = utils.sanitiseString(core.getInput('trunk-branch')) // check against the name of branch in push trigger conditions
    const checkoutRoot = core.getInput('checkout-root')
    if (!fs.existsSync(checkoutRoot)) {
      core.setFailed(`The specified path in checkout-root doesn't exist: ${checkoutRoot}`)
    }

    /**
     * The logic for parsing the workflow.on.push.branches
     * @param workflow
     * @param workflowPath
     * @returns
     */
    function thisPushWouldTriggerOnBranches(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      workflow: any,
      workflowPath: string
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
        trunkWouldTriggerThis = minimatch(trunkBranch, onBranch) ? positiveCheck : trunkWouldTriggerThis
        headWouldTriggerThis = minimatch(headBranch, onBranch) ? positiveCheck : headWouldTriggerThis
      }
      if (headWouldTriggerThis) {
        console.log(
          `Dispatchable workflow triggered by push on branches: Head (this) "${headBranch}" will trigger: ${workflowPath}`
        )
      }
      if (trunkWouldTriggerThis) {
        console.log(
          `Dispatchable workflow triggered by push on branches: Trunk "${trunkBranch}" will trigger: ${workflowPath}`
        )
      }
      if (!trunkWouldTriggerThis && !headWouldTriggerThis) {
        console.log(
          `Dispatchable workflow triggered by push on branches: Neither trunk nor head would trigger this: ${workflowPath}`
        )
      }
      return { head: headWouldTriggerThis, trunk: trunkWouldTriggerThis }
    }

    /**
     * The logic for parsing the workflow.on.push.branches-ignore
     * @param workflow
     * @param workflowPath
     * @returns
     */
    function thisPushWouldTriggerOnBranchesIgnore(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      workflow: any,
      workflowPath: string
    ): { head: boolean; trunk: boolean } {
      // If branches-ignore is present, no need to check for negation.
      const trunkWouldTriggerThis = !workflow.on.push['branches-ignore']
        .map((branch: string) => minimatch(trunkBranch, branch))
        .includes(true)
      const headWouldTriggerThis = !workflow.on.push['branches-ignore']
        .map((branch: string) => minimatch(headBranch, branch))
        .includes(true)
      if (trunkWouldTriggerThis) {
        console.log(
          `Dispatchable workflow triggered by push on branches-ignore: Trunk "${trunkBranch}" will trigger: ${workflowPath}`
        )
      }
      if (headWouldTriggerThis) {
        console.log(
          `Dispatchable workflow triggered by push on branches-ignore: Head (this) "${headBranch}" will trigger: ${workflowPath}`
        )
      }
      return { head: headWouldTriggerThis, trunk: trunkWouldTriggerThis }
    }

    function thisPushWouldTriggerOnTags(workflowPath: string): { head: boolean; trunk: boolean } {
      console.log(
        `Dispatchable workflow triggered by push on <tags|tags-ignore>: Ignoring this workflow: ${workflowPath}`
      )
      return { head: false, trunk: false }
    }

    /**
     * The logic for parsing the workflow.on.push.<branches|branches-ignore>.
     * Returns an object that provides _.head and _.trunk as true if those refs
     * are matched by the ordered globs on the <branches|branches-ignore>, and
     * false if they are not matched, or negatively matched. Returns false for
     * both if neither the <branches|branches-ignore> field exists, as this does
     * not care about tag refs.
     * @param workflow
     * @param workflowPath
     * @returns
     */
    // Any required from output of yaml.parse
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function thisPushWouldTriggerOnAPushToRef(workflow: any, workflowPath: string): { head: boolean; trunk: boolean } {
      // 'branches-ignore' and 'branches' are mutually exclusive.
      if ('branches-ignore' in workflow.on.push && workflow.on.push['branches-ignore'] != null) {
        return thisPushWouldTriggerOnBranchesIgnore(workflow, workflowPath)
      } else if ('branches' in workflow.on.push && workflow.on.push.branches != null) {
        return thisPushWouldTriggerOnBranches(workflow, workflowPath)
      } else {
        return thisPushWouldTriggerOnTags(workflowPath)
      }
    }

    // Right now we only want to comment for dispatchable workflows that would
    // trigger on pushes to the trunk but ignore those that have already been
    // triggered by pushes to the non-trunk headref. This abstraction exists in
    // case later on we want to handle an option to include any branch that will
    // be triggered on the trunk regardless if they have already been triggered.
    function weWantToMentionThisWorkflowInTheComment(triggersOnPushTo: { head: boolean; trunk: boolean }): boolean {
      return triggersOnPushTo.trunk ? !triggersOnPushTo.head : false
    }

    async function getWorkflows(): Promise<string[]> {
      try {
        // Get the list of files existing locally, and hit the API.
        const workflowPathList = utils.getFilesMatchingGithubWorkflows(checkoutRoot)
        const workflowsListedByAPI = await ghRestAPI.actions.listRepoWorkflows({
          owner: owner,
          repo: repo
        })
        const ratelimitInfo: { [header: string]: string | number | undefined } = {}
        ratelimitInfo['x-ratelimit-limit'] = workflowsListedByAPI.headers['x-ratelimit-limit']
        ratelimitInfo['x-ratelimit-remaining'] = workflowsListedByAPI.headers['x-ratelimit-remaining']
        ratelimitInfo['x-ratelimit-reset'] = workflowsListedByAPI.headers['x-ratelimit-reset']
        ratelimitInfo['x-ratelimit-resource'] = workflowsListedByAPI.headers['x-ratelimit-resource']
        ratelimitInfo['x-ratelimit-used'] = workflowsListedByAPI.headers['x-ratelimit-used']
        console.log('REST Rate Limit Info:', ratelimitInfo)
        core.notice(`REST Rate Limit Info: ${JSON.stringify(ratelimitInfo)}`)
        // Remap the API's response
        const workflowsAPI = new Map(workflowsListedByAPI.data.workflows.map((workflow) => [workflow.path, workflow]))
        // Get details of each workflow
        console.log('All workflows LOCAL are ', workflowPathList.paths.toString())
        console.log('All workflows API are ', Array.from(workflowsAPI.keys()).toString())
        const workflowsFound = workflowPathList.paths.filter((x) => workflowsAPI.has(x))
        // We need the paths and root directory supplied separated from calling
        // getFilesMatchingGithubWorkflows so we can match only the part of the
        // paths that matches the workflow regex with the list of workflow paths
        // returned by the API. But we need to glue them back to the whole path
        // for finding and reading the yaml.
        const dispatchableWorkflowsThatRequireInputs: string[] = []
        const dispatchableWorkflowsTriggeredByPush: string[] = []
        const dispatchableWorkflowsTriggeredByPushThatDontRequireInputs = []
        // NOW WE HAVE THE LIST OF WORKFLOWS, we can iterate them to check ON's.
        for (const workflowPath of workflowsFound) {
          const workflowContent = fs.readFileSync(path.join(workflowPathList.directory, workflowPath), 'utf8')
          const workflow = yaml.parse(workflowContent)
          if ('on' in workflow && 'workflow_dispatch' in workflow.on) {
            ////////////////////////////////////////////////////////////////////
            // Now we are only dealing with dispatchable workflows only.
            ////////////////////////////////////////////////////////////////////
            if (core.getInput('log-workflow-triggers') != 'false') {
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
              console.log(`Dispatchable workflow triggered by push: ${workflowPath}`)
              const triggersOnPushTo = thisPushWouldTriggerOnAPushToRef(workflow, workflowPath)
              if (weWantToMentionThisWorkflowInTheComment(triggersOnPushTo)) {
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

    // TODO NEXT BRANCH: Go back through the branches|branches-ignore checkers and check against changed paths!!!!

    const dispatchableWorkflows = await getWorkflows()
    core.setOutput('list-of-dispatchable-workflows', dispatchableWorkflows)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

await run()
