import * as core from '@actions/core'
import * as github from '@actions/github'
import { graphql } from '@octokit/graphql'

const MAX_GH_GQL_PAGINATION = 100

async function run() {
  try {
    const context = github.context
    const eventName = context.eventName

    // If this isn't running under a PR trigger, annotate and leave early
    if (eventName !== 'pull_request') {
      core.setFailed(
        `dispatch-suggestor can only be run from a pull_request event, but it was triggered by a ${eventName} event.`
      )
      return
    }

    // Otherwise, procede as usual
    const token = core.getInput('github_token')

    // EXAMPLE LEFTOVER
    const nameToGreet = core.getInput('name-of-input')
    console.log(`Hello ${nameToGreet}!`)
    const time = new Date().toTimeString()
    core.setOutput('name-of-output', time)
    // Get the JSON webhook payload for the event that triggered the workflow
    // const payload = JSON.stringify(github.context.payload, undefined, 2)
    // console.log(`The event payload: ${payload}`)

    async function getPRNumber() {
      return context.payload.pull_request
        ? context.payload.pull_request.number
        : null
    }

    const owner = context.repo.owner
    const repo = context.repo.repo
    const pullRequestNumber = await getPRNumber()
    console.log('owner:', owner)
    console.log('repo:', repo)
    console.log('pullRequestNumber:', pullRequestNumber)

    const gql_query_list_PR_files = `
      query($owner: String!, $name: String!, $pullRequestNumber: Int!) {
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
    interface GQLQueryListPRFiles {
      data: {
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
    }

    async function fetchChangedFiles() {
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

        const files = result.data.repository.pullRequest.files.edges.map(
          (edge) => edge.node
        )
        const rateLimitInfo = result.data.rateLimit
        console.log('Changed files:', files)
        console.log('Rate Limit Info:', rateLimitInfo)
        core.notice(`Changed files: ${files}`)
        core.warning(`Rate Limit Info: ${rateLimitInfo}`)
      } catch (error) {
        core.error(`Error fetching changed files: ${error}`)
      }
    }

    fetchChangedFiles()
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

await run()
