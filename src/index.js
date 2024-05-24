const core = require('@actions/core');
const github = require('@actions/github');

try {
  // `name-of-input` input defined in action metadata file
  const nameToGreet = core.getInput('name-of-input');
  console.log(`Hello ${nameToGreet}!`);
  const time = (new Date()).toTimeString();
  core.setOutput("name-of-output", time);
  // Get the JSON webhook payload for the event that triggered the workflow
  const payload = JSON.stringify(github.context.payload, undefined, 2)
  console.log(`The event payload: ${payload}`);
} catch (error) {
  core.setFailed(error.message);
}
