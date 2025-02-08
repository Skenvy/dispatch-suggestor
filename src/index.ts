import * as core from '@actions/core'
import * as github from '@actions/github'
import { graphql } from '@octokit/graphql'
import { Octokit } from '@octokit/rest'

import * as fs from 'fs'
import * as yaml from 'yaml'

const MAX_GH_GQL_PAGINATION = 100

async function run() {
  try {
    // TODO REMOVE THIS LEFTOVER EXAMPLE
    const time = new Date().toTimeString()
    core.setOutput('name-of-output', time)

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
    // const trunkBranch = core.getInput('trunk-branch')
    console.log('owner:', owner)
    console.log('repo:', repo)
    console.log('pullRequestNumber:', pullRequestNumber)

    // STEP ONE: Get the list of files this PR touches
    // At the moment this is done with the graphql endpoint. If for some reason
    // that ends up being too frequently used, could add an option to use the
    // rest api instead, but no point implementing both now.

    // Query for acquiring the list of files changed by this PR + the graphql API ratelimit
    const gql_query_list_PR_files = `
      query($owner: String!, $name: String!, $pullRequestNumber: Int!, $MAX_GH_GQL_PAGINATION: Int!) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $pullRequestNumber) {
            files(first: $MAX_GH_GQL_PAGINATION) {
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
          MAX_GH_GQL_PAGINATION,
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

    const files = fetchChangedFiles()

    // STEP TWO: Get the set of triggering conditions for all trunk workflows.
    // The rest API for a github_token has a rate limit of 1000/hour/repo. Thats
    // not all that much when this is expected to be geared for a monorepo that
    // could have high double digit to triple digit workflows with frequent
    // pushes. AS SUCH -- this parses checked out files '''locally''' i.e. this
    // is expecting the workflow that runs it to have run actions/checkout.

    // const branchContext = context.payload.pull_request.head.ref

    async function getWorkflows() {
      try {
        // Get the list of workflows
        const workflowsList = await ghRestAPI.actions.listRepoWorkflows({
          owner: owner,
          repo: repo
        })
        const workflows = workflowsList.data.workflows
        // Get details of each workflow
        for (const workflow of workflows) {
          const workflowContentResponse = await ghRestAPI.repos.getContent({
            owner: owner,
            repo: repo,
            path: `.github/workflows/${workflow.path}`
          })
          // getContent has a union type. Inspect it and go for a lil walk through node_modules ...
          // @octokit/rest/node_modules/@octokit/plugin-rest-endpoint-methods/dist-types/generated/method-types.d.ts
          // @octokit/rest/node_modules/@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types.d.ts
          // @octokit/types/dist-types/generated/Endpoints.d.ts ~ @octokit/openapi-types/types.d.ts
          // "/repos/{owner}/{repo}/contents/{path}" ~ "repos/get-content"
          // s
          const workflowData = workflowContentResponse.data
          if (Array.isArray(workflowData)) {
            return ''
          }
          const workflowFileContent = Buffer.from(workflowData.content, 'base64').toString('utf8')
          const workflowYaml = yaml.load(workflowFileContent)
          console.log(`Workflow: ${workflowYaml.name}`)
          console.log(`On: ${JSON.stringify(workflowYaml.on, null, 2)}`)
        }
      } catch (error) {
        console.error('Error fetching workflows:', error)
      }
    }

    getWorkflows()

    // TODO Remove temporarily log the files a second time to stop it complaining about files being unused.
    console.log('Changed files:', files)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

await run()
