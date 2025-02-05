import * as core from '@actions/core'
import * as github from '@actions/github'
import { graphql } from '@octokit/graphql'

const MAX_GH_GQL_PAGINATION = 100

async function run() {
  try {
    // TODO REMOVE THIS LEFTOVER EXAMPLE
    // const nameToGreet = core.getInput('name-of-input')
    // console.log(`Hello ${nameToGreet}!`)
    // const time = new Date().toTimeString()
    // core.setOutput('name-of-output', time)
    // Get the JSON webhook payload for the event that triggered the workflow
    // const payload = JSON.stringify(github.context.payload, undefined, 2)
    // console.log(`The event payload: ${payload}`)

    const context = github.context
    const eventName = context.eventName

    // If this isn't running under a PR trigger, annotate and leave early
    if (eventName !== 'pull_request') {
      core.setFailed(
        `dispatch-suggestor can only be run from a pull_request event, but it was triggered by a ${eventName} event.`
      )
      return
    }

    // Otherwise, procede as usual. Prep the token, owner, repo and PR#
    const token = core.getInput('github_token')

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
          files = result.repository.pullRequest.files.edges.map(
            (edge) => edge.node.path
          )
          const rateLimitInfo = result.rateLimit
          console.log('Changed files:', files)
          console.log('Rate Limit Info:', rateLimitInfo)
          core.notice(`Changed files: ${files.toString()}`)
          core.warning(`Rate Limit Info: ${rateLimitInfo.toString()}`)
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

    // temporarily log the files a second time to stop it complaining about files being unused.
    console.log('Changed files:', files)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

await run()
