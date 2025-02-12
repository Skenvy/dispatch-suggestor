# Devlog
This is motivated by forgetting several times to test a branch deployment by dispatching its workflow, that would otherwise trigger from a push on the trunk, when working in repositories that followed a pattern of only deploying from non-trunk branches when manually dispatched. Hence the summary of what this tries to do is;
> Suggests dispatchable workflows for a branch that would otherwise trigger the dispatchable workflows from pushes to the trunk.

## Start making a node action
I've made a docker based action in the past but it'd be nice to try making a node based action. We can start with the github docs [Creating a JavaScript action](https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action). It's also good to keep on hand a link to [Metadata syntax for GitHub Actions](https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions).

Something that can be seen quickly from this doc is that we'll need to build a single dist file from our source, using something like `npx ncc build src/index.ts --license licenses.txt` to build `dist/` which uses [vercel/ncc](https://github.com/vercel/ncc) to bundle our source and dependent code from `node_modules` into the single dist file.

[Understanding the risk of script injections](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#understanding-the-risk-of-script-injections)
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

## Jest: a tool that mocks _you_
> [!IMPORTANT]
> This is probably my most vitriolic devlog addition I've ever included. I want to capture the vibe and sense of frustration when it's fresh to be a genuine take, but this is purely a reflection on how I've attempted to use it. I'm sure there are many people / teams that get value out of this very popular tool, but from my experience trying to use it here, I would not try to use it personally again, at least not until possibly after having had to learn it for use on some project where I don't have the power of choice. There is also a disclaimer that a lot of the time spent wasted on this was also trying to test out what it's like to use co-pilot, so it might be fair to say that co-pilot should also be part of this rant, but it's been useful in other areas so far, this just happened to be something it struggled with, and I credit it's insistence on suggesting to use jest to mock builtins in ESM as if they were the same as mocking user src code in CJS with a lot of the frustration directed at jest in general here.

TLDR if there is actually a way to mock node builtins in ESM, please let me know. I genuinely lost count of how many different things I tried that all got stuck on impossible to solve errors.

Holy shit. That's about all there is to say. I have never experienced a tool I hated more than jest mocks. It is straight up impossible to use.

Yes, I might have shot myself in the foot by asking co-pilot for assistance writing a jest test case, without knowing the nuance of why it could end up being so wrong. First, co-pilot got stuck in a loop of endlessly claiming it was trying to fix the test and then repeatedly printing out the exact same file. Trying to find any information on what the problems it was spitting out meant was a walk through an absurdist hellscape of SO posts and blog articles sharing examples, none of which would work locally. Literally none of the dozens of examples worked locally. And then after a few hours of trying to wrangle these obscure errors, I find out it was a problem with jest not having fully implemented ESM mocking.

Well that explains why a whole lot of examples for CJS didn't work. But there is no uniform pattern or even a single suggested pattern on how to mock in ESM. The [page for ESM on jest docs](https://jestjs.io/docs/ecmascript-modules) teases you with the suggestion it might include an example in ESM, then 1:2's you with the "lol nah here's the CJS example." It also turns out from the [manual mocking](https://jestjs.io/docs/manual-mocks#mocking-node-modules) docs that jest also struggles with mocking node's builtins. Which is significantly more understandable, but there is no example of how to do this in ESM. I then though "fuck it, how out of reach can jest be to esm" so followed some of the docs examples for snippets that didn't appear to touch the builtins and that appeared to follow the same general pattern in the handful of blog posts that demostrated ESM jest.

Yet still, not a single example from anywhere worked. The only ESM jest I was able to run, even just to sanity check that I wasn't losing my mind, was the [example typescript action]((https://github.com/actions/typescript-action)). Not a single other example from anywhere worked. I regret the several hours of my life I have wasted trying to understand this absolute garbage-dumpster-on-fire of a mocking tool. I guess, in the end, it was I who was mocked, for wasting time on this.

Yes, I know it's FLOSS and no hate to the maintainers, they have no obligation to provide a tool that I can use.. but I have no idea how this is apparently so widely adopted when the curve it takes to get started is so steep that it has taken me upwards of 10 hours across multiple nights to reach the point of just giving up on it rather than continuing down the spent cost road like I have with literally every other tool. It's so bad it's the first tool I've legitimately given up on, knowing that I'll be able to wrangle integration tests anyway. The primary value in attempting it as part of this was because it was the default suggested tool by the template repo, and the value was in trying it out to learn that I hate it.
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
