import * as core from '@actions/core'
import * as github from '@actions/github'
import { graphql } from '@octokit/graphql'
import { Octokit } from '@octokit/rest'

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'yaml'

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

    // const branchContext = context.payload.pull_request.head.ref // use when templating the dispatch trigger URL
    // const trunkBranch = core.getInput('trunk-branch') // check against the name of branch in push trigger conditions
    const checkoutRoot = core.getInput('checkout-root')
    if (!fs.existsSync(checkoutRoot)) {
      core.setFailed(`The specified path in checkout-root doesn't exist: ${checkoutRoot}`)
    }

    async function getWorkflows() {
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
        for (const workflowPath of workflowsFound) {
          const workflowContent = fs.readFileSync(path.join(workflowPathList.directory, workflowPath), 'utf8')
          const workflow = yaml.parse(workflowContent)
          if (core.getInput('log-workflow-triggers') != 'false') {
            if ('on' in workflow && 'workflow_dispatch' in workflow.on) {
              console.log(`Workflow Path: ${workflowPath}`)
              if ('name' in workflow) {
                console.log(`Workflow Name: ${workflow.name}`)
              }
              console.log(`On: ${JSON.stringify(workflow.on, null, 2)}`)
              // NEXT BRANCH: Implement the logic here to parse to `workflow.on`
            }
          }
        }
      } catch (error) {
        console.error('Error fetching workflows:', error)
      }
    }

    const dispatchableWorkflows = await getWorkflows()
    core.setOutput('list-of-dispatchable-workflows', dispatchableWorkflows)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

await run()
