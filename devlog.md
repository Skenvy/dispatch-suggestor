# Devlog
> [!CAUTION]
> See ["How to approach reading my devlogs"](https://github.com/Skenvy/Skenvy/blob/main/extra/docs/devlog.md) if you need to.

This is motivated by forgetting several times to test a branch deployment by dispatching its workflow, that would otherwise trigger from a push on the trunk, when working in repositories that followed a pattern of only deploying from non-trunk branches when manually dispatched. Hence the summary of what this tries to do is;
> Suggests dispatchable workflows for a branch that would otherwise trigger the dispatchable workflows from pushes to the trunk.

## Start making a node action
I've made a docker based action in the past but it'd be nice to try making a node based action. We can start with the github docs [Creating a JavaScript action](https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action). It's also good to keep on hand a link to [Metadata syntax for GitHub Actions](https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions).

Something that can be seen quickly from this doc is that we'll need to build a single dist file from our source, using something like `npx ncc build src/index.ts --license licenses.txt` to build `dist/` which uses [vercel/ncc](https://github.com/vercel/ncc) to bundle our source and dependent code from `node_modules` into the single dist file.

[Understanding the risk of script injections](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#understanding-the-risk-of-script-injections)

It will be relevant to the rate limit notices this puts out, so [here's the info on API rate limits for the `GITHUB_TOKEN`](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28#primary-rate-limit-for-github_token-in-github-actions).
## Using the typescript-action template
[Create a GitHub Action Using TypeScript](https://github.com/actions/typescript-action)

I first initialiased this back in May 2024 but didn't create it back then, so initially it was using [this](https://github.com/actions/typescript-action/tree/c55649f1894ca3da34f7e38d40fa103ce865044a) state of the `typescript-action` template. It looks like it's changed a lot in the year since, so we may as well update this to the [current](https://github.com/actions/typescript-action/tree/1e68449593284f2ee5ffd6679abb32f9e222b3bb) version. A small but significant detail that changed is it's now using [rollup/rollup](https://github.com/rollup/rollup) instead of [vercel/ncc](https://github.com/vercel/ncc) to handle bundling the dist.

**This paragraph is a rant**. Very quickly, something as simple as trying to re-introduce the `inclusion of the licenses of the dependency modules` in the output dist e.g. a bundled `dist/licenses.txt`, starts popping up error after error after error with `rollup` not being happy importing interfaces and struggling to work with typescript, and reminds me that doing anything other than the basic examples in any JS/TS development will quickly turn into a minefield. I.e. in the course of trying to learn why `rollup` wasn't happy with importing a particular interface from a plugin, and googling any of the several variety of `(Note that you need plugins to import files that are not JavaScript)` errors resulted in a cornucopia of SO posts and blog posts outlining various settings in the `tsconfig`, setting the `tsconfig` option on `rollup`'s `plugin-typescript` to a custom one, or swapping between multiple interations of other implementations of the `'@rollup/plugin-typescript'` package. _Adding a plugin to rollup shouldn't take hours of reading SO posts to try understand why it yields several different errors progressively_. As a fresh example -- I keep getting `(!) [plugin typescript] @rollup/plugin-typescript: Rollup 'sourcemap' option must be set to generate source maps.` which seems to have a whole bunch of hits with many answers that don't seem to make the warning go away or even get `rollup` to actually create the sourcemap, and visitng [rollup's cli docs](https://rollupjs.org/command-line-interface/#configplugin-plugin) after seeing the `--configPlugin @rollup/plugin-typescript` in the `package.json`'s `scripts`, and reading from the docs that;
> Note for Typescript: make sure you have the Rollup config file in your `tsconfig.json`'s `include` paths. For example:
> ```
> "include": ["src/**/*", "rollup.config.ts"],
> ```
and doing what the docs say, instead of fixing anything or even managing to just work without causing more issues, throws 10 new errors on the next `npm run bundle`. I regret putting in time to update from [vercel/ncc](https://github.com/vercel/ncc), which just worked without hours of trying to figure out what is wrong with it.

TLDR rollup has been so frustrating to setup as part of this template I ended up raising two issues on the `actions/typescript-template`, [#1010](https://github.com/actions/typescript-action/issues/1010) and [#1011](https://github.com/actions/typescript-action/issues/1011) (which refs the fix [rollup/plugins #1805](https://github.com/rollup/plugins/issues/1805)).

## Jest
> [!NOTE]
> This section was initially written as misdirected frustration at the conflux of trying to both evaluate how easy it is to use copilot while also trying to learn, or at least implement, jest for the first time. Not just jest on it's own as a runner, but specifically jest mocks. _More specifically_, jest mocks where the thing being mocked was supposed to be node builtins (`fs` and `path`) _and_ the project is ESM not CJS. I spent several hours over a few days trying to get copilot, along with SO and jest docs, to give me a way or even an example, of jest mocking node builtins in ESM. Not a single example worked. So I wrote a very frustrated opinion, that was probably more appropriately directed at my own insistence to keep trying down this path for so long. It was still an accurate representation of how frustrating the conflux of the situation was, but probably unfair to direct it all at jest, so I've removed it. If you want to read it it's still in history, but you've been warned.

* [ESM on jest docs](https://jestjs.io/docs/ecmascript-modules)
* [Manual mocking](https://jestjs.io/docs/manual-mocks#mocking-node-modules)

> The only ESM jest I was able to run, even just to sanity check that I wasn't losing my mind, was the [example typescript action]((https://github.com/actions/typescript-action)). Not a single other example from anywhere across countless SO posts and multiple blogs and the jest docs themselves worked.
## Start making the action's functionality
Ideally, we want the required `permissions:` to be as minimal as possible, and to require as little else out of the enclosing job / workflow. The two things that will need to be known within the action for it to produce its list of dispatch links, are firstly a list of all triggering conditions on all workflows, as well as the filenames of the contents of a PR.
### Get all workflow triggering conditions
Attempting to use co-pilot for the first time, it suggests a way of achieving this with both the REST API and the GraphQL API. Something worth knowing about both is that they simply expect the full retrieval of the workflows, so a viable alternative could be to require the enclosing job to run something like this first.
```yaml
- name: Checkout
  uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
  with:
    sparse-checkout: .github/workflows
    sparse-checkout-cone-mode: false
```
<details>
<summary>Co-pilot's generation</summary>

#### Rest
```javascript
const axios = require('axios');

// Replace with your GitHub token
const token = process.env.GITHUB_TOKEN;

// Replace with your repository details
const owner = 'Skenvy';
const repo = 'dispatch-suggestor';

async function getWorkflows() {
  try {
    // Get the list of workflows
    const workflowsResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/actions/workflows`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    const workflows = workflowsResponse.data.workflows;

    // Get details of each workflow
    for (const workflow of workflows) {
      const workflowDetailsResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      const workflowDetails = workflowDetailsResponse.data;
      console.log(`Workflow: ${workflowDetails.name}`);
      console.log(`Triggering Conditions: ${JSON.stringify(workflowDetails.on, null, 2)}`);
      console.log('---');
    }
  } catch (error) {
    console.error('Error fetching workflows:', error);
  }
}

getWorkflows();
```
#### GraphQL
```javascript
const { graphql } = require('@octokit/graphql');

// Replace with your GitHub token
const token = process.env.GITHUB_TOKEN;

// Replace with your repository details
const owner = 'Skenvy';
const repo = 'dispatch-suggestor';

const listFilesQuery = `
  query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      object(expression: "HEAD:.github/workflows") {
        ... on Tree {
          entries {
            name
            type
          }
        }
      }
    }
  }
`;

const fetchFileContentQuery = `
  query($owner: String!, $name: String!, $filePath: String!) {
    repository(owner: $owner, name: $name) {
      object(expression: $filePath) {
        ... on Blob {
          text
        }
      }
    }
  }
`;

async function fetchWorkflowFiles() {
  try {
    // List workflow files
    const filesResult = await graphql({
      query: listFilesQuery,
      owner,
      name: repo,
      headers: {
        authorization: `token ${token}`,
      },
    });

    const workflowFiles = filesResult.repository.object.entries.filter(entry => entry.type === 'blob');

    // Fetch content of each workflow file
    for (const file of workflowFiles) {
      const filePath = `HEAD:.github/workflows/${file.name}`;
      const fileContentResult = await graphql({
        query: fetchFileContentQuery,
        owner,
        name: repo,
        filePath,
        headers: {
          authorization: `token ${token}`,
        },
      });

      const fileContent = fileContentResult.repository.object.text;
      console.log(`File: ${file.name}`);
      console.log(`Content:\n${fileContent}`);
      console.log('---');
    }
  } catch (error) {
    console.error('Error fetching workflow files:', error);
  }
}

fetchWorkflowFiles();
```
#### Rest
\+ "checking and forming the dispatch url"
\+ "incorporate the branch name into the dispatch url" * 3
\+ "check that the dispatch doesn't expect required arguments"
```javascript
const axios = require('axios');

// Replace with your GitHub token
const token = process.env.GITHUB_TOKEN;

// Replace with your repository details
const owner = 'Skenvy';
const repo = 'dispatch-suggestor';

// Replace with your branch context (this can be set via an environment variable)
const branchContext = process.env.BRANCH_CONTEXT || 'main';

async function getWorkflows() {
  try {
    // Get the list of workflows
    const workflowsResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/actions/workflows`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    const workflows = workflowsResponse.data.workflows;

    // Get details of each workflow
    for (const workflow of workflows) {
      const workflowDetailsResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      const workflowDetails = workflowDetailsResponse.data;
      console.log(`Workflow: ${workflowDetails.name}`);
      console.log(`Triggering Conditions: ${JSON.stringify(workflowDetails.on, null, 2)}`);

      // Check if workflow_dispatch is one of the triggers
      if (workflowDetails.on.workflow_dispatch) {
        const dispatchUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow.id}/dispatches`;
        
        // Check for required inputs
        const requiredInputs = workflowDetails.on.workflow_dispatch.inputs || {};
        const hasRequiredInputs = Object.keys(requiredInputs).length > 0;

        console.log(`Dispatch URL: ${dispatchUrl}`);
        console.log(`Requires Inputs: ${hasRequiredInputs}`);
        if (hasRequiredInputs) {
          console.log(`Required Inputs: ${JSON.stringify(requiredInputs, null, 2)}`);
        }

        // Print dispatch URL with branch context
        const dispatchUrlWithBranch = `${dispatchUrl}?ref=${branchContext}`;
        console.log(`Dispatch URL with Branch Context: ${dispatchUrlWithBranch}`);
      }

      console.log('---');
    }
  } catch (error) {
    console.error('Error fetching workflows:', error);
  }
}

getWorkflows();
```
Using the REST API as above to check the triggering conditions seems like a good place to start for now.
### Get all filenames in a PR
Initially, co-pilot kept suggesting using a step to achieve this
```yaml
- name: Get changed files
  id: changed-files
  uses: octokit/request-action@v2.x
  with:
    route: GET /repos/${{ github.repository }}/pulls/${{ github.event.pull_request.number }}/files
    mediaType: '{"format":"json"}'
    headers: '{"authorization":"token ${{ secrets.GITHUB_TOKEN }}"}'
```
I eventually asked it if it could handle just getting the list of files, possibly with the graphql API, and got the query+action
```graphql
query($owner: String!, $name: String!, $pullRequestNumber: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pullRequestNumber) {
      files(first: 100) {
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
}
```
```javascript
const { graphql } = require('@octokit/graphql');

// Replace with your GitHub token
const token = process.env.GITHUB_TOKEN;

// Replace with your repository details and pull request number
const owner = 'Skenvy';
const repo = 'dispatch-suggestor';
const pullRequestNumber = 1;

const query = `
  query($owner: String!, $name: String!, $pullRequestNumber: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $pullRequestNumber) {
        files(first: 100) {
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
  }
`;

async function fetchChangedFiles() {
  try {
    const result = await graphql({
      query,
      owner,
      name: repo,
      pullRequestNumber,
      headers: {
        authorization: `token ${token}`,
      },
    });

    const files = result.repository.pullRequest.files.edges.map(edge => edge.node);
    console.log('Changed files:', files);
  } catch (error) {
    console.error('Error fetching changed files:', error);
  }
}

fetchChangedFiles();
```
I was cautios of the rate limit on the graphql API, which can be checked with;
```graphql
query {
  rateLimit {
    limit
    cost
    remaining
    resetAt
  }
}
```
I asked it to esimtate the rate limit point cost for the search of filenames, and instead it suggested querying for the cost as part of the filename retrieval, with
```graphql
query($owner: String!, $name: String!, $pullRequestNumber: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $pullRequestNumber) {
      files(first: 100) {
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
```
Or all up as
```javascript
const { graphql } = require('@octokit/graphql');

// Replace with your GitHub token
const token = process.env.GITHUB_TOKEN;

// Replace with your repository details and pull request number
const owner = 'Skenvy';
const repo = 'dispatch-suggestor';
const pullRequestNumber = 1;

const query = `
  query($owner: String!, $name: String!, $pullRequestNumber: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $pullRequestNumber) {
        files(first: 100) {
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
`;

async function fetchChangedFiles() {
  try {
    const result = await graphql({
      query,
      owner,
      name: repo,
      pullRequestNumber,
      headers: {
        authorization: `token ${token}`,
      },
    });

    const files = result.repository.pullRequest.files.edges.map(edge => edge.node);
    const rateLimitInfo = result.rateLimit;
    console.log('Changed files:', files);
    console.log('Rate Limit Info:', rateLimitInfo);
  } catch (error) {
    console.error('Error fetching changed files:', error);
  }
}

fetchChangedFiles();
```
</details>

### Handle comments on a PR
Get comments on a PR and find any previous comments this action wrote on them and update them if necessary. I had a few questions for Co-pilot regarding acting with an identity specific to the action writing a comment, but unfortunately such a thing is apparently only possible when the thing the action does is instead written as a GitHub app, and installed by a user. As this is an action (primarily to enable sha-pinning, as the installted state of Apps are not versioned in any way) we'll have to accept that the identity commenting on the PRs will be that of the `github-actions[bot]`. So I asked co-pilot
> If I do use the GITHUB_TOKEN to post a comment on a PR, and it has to be identified as the github actions bot, what's a good way for subsequent runs of the action that posts the comment to get all the comments that are already on the PR to try and find its previous comment so it can then update it rather than post new comments every subsequent run?

It provided an answer that would put searchable text in the top of each comment. But knowing that would be visible and we can use html tags to hide content and might want a more unique identifier, I had to coax it with;
> the only problem with that is that the botCommentIdentifier would be visible in the text of the comment, no? Is there some way to identify the comment the bot previously posted with a comment identifier that wouldn't be visible in the PR when viewed in the browser UI?

This makes use of `@actions/github` to hit 3 REST endpoints;
* [GET /repos/{owner}/{repo}/issues/{issue_number}/comments](https://docs.github.com/en/rest/issues/comments?apiVersion=2022-11-28#list-issue-comments)
    * if it doesn't exist yet: [POST /repos/{owner}/{repo}/issues/{issue_number}/comments](https://docs.github.com/en/rest/issues/comments?apiVersion=2022-11-28#create-an-issue-comment)
    * if the comment already exists: [PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}](https://docs.github.com/en/rest/issues/comments?apiVersion=2022-11-28#update-an-issue-comment)

<details>
<summary>Co-pilot's code</summary>

```typescript
const core = require('@actions/core');
const github = require('@actions/github');

async function run() {
  try {
    const token = process.env.GITHUB_TOKEN;
    const octokit = github.getOctokit(token);
    const context = github.context;

    const { owner, repo } = context.repo;
    const issueNumber = context.payload.pull_request.number;

    // Fetch all comments on the PR
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
    });

    const botCommentIdentifier = '<!-- BOT_COMMENT_IDENTIFIER -->'; // Hidden identifier for the bot comment
    let botComment = comments.find(comment => comment.user.login === 'github-actions[bot]' && comment.body.includes(botCommentIdentifier));

    const newCommentBody = `${botCommentIdentifier}\n\nThis is the updated comment content.`;

    if (botComment) {
      // Update the existing comment
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: botComment.id,
        body: newCommentBody,
      });
      console.log('Comment updated successfully.');
    } else {
      // Create a new comment
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: newCommentBody,
      });
      console.log('Comment created successfully.');
    }
  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`);
  }
}

run();
```
Someone probably needs to tell Co-pilot to run dependabot lol it wants this to be run with a workflow that uses ancient versions.
```yaml
- name: Checkout repository
  uses: actions/checkout@v2
- name: Setup Node.js
  uses: actions/setup-node@v2
  with:
    node-version: '14'
```
</details>


### Handle pagination of the list all repo workflows API
The API for listing repo workflows [see docs](https://docs.github.com/en/rest/actions/workflows?apiVersion=2022-11-28#list-repository-workflows) uses pagination, specifically `per_page` and `page`, with a `per_page` default of `30` and max of `100`. The general gh api pagination docs [here](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api?apiVersion=2022-11-28) include a way to specify these in curl. Although they don't mention using them this way on the gh CLI, it functions much the same way. For instance, to get the list of workflows for this repo,
```bash
# Default
gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" /repos/Skenvy/dispatch-suggestor/actions/workflows
# Using `per_page` and `page`
gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "/repos/Skenvy/dispatch-suggestor/actions/workflows?per_page=1&page=1"
```
Two important observations for us to make here is that the data that comes back includes a `total_count` field which is not the count of workflows retrieved in this call of the API, but the total amount of workflows in the repo. Because of this, it can't be used to check for an empty response. For example, if we ask this for the 100th page, it will give back something along the lines of
```json
{
  "total_count": 17,
  "workflows": []
}
```
