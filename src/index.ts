import * as core from '@actions/core'
import * as github from '@actions/github'

try {
  // `name-of-input` input defined in action metadata file
  const nameToGreet = core.getInput('name-of-input')
  console.log(`Hello ${nameToGreet}!`)
  const time = new Date().toTimeString()
  core.setOutput('name-of-output', time)
  // Get the JSON webhook payload for the event that triggered the workflow
  const payload = JSON.stringify(github.context.payload, undefined, 2)
  console.log(`The event payload: ${payload}`)
} catch (error) {
  if (error instanceof Error) core.setFailed(error.message)
}
