# Devlog
This is motivated by forgetting several times to test a branch deployment by dispatching its workflow, that would otherwise trigger from a push on the trunk, when working in repositories that followed a pattern of only deploying from non-trunk branches when manually dispatched. Hence the summary of what this tries to do is;
> Suggests dispatchable workflows for a branch that would otherwise trigger the dispatchable workflows from pushes to the trunk.

## Start making a node action
I've made a docker based action in the past but it'd be nice to try making a node based action. We can start with the github docs [Creating a JavaScript action](https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action). It's also good to keep on hand a link to [Metadata syntax for GitHub Actions](https://docs.github.com/en/actions/creating-actions/metadata-syntax-for-github-actions).

Something that can be seen quickly from this doc is that we'll need to build a single dist file from our source, using something like `npx ncc build src/index.ts --license licenses.txt` to build `dist/` which uses [vercel/ncc](https://github.com/vercel/ncc) to bundle our source and dependent code from `node_modules` into the single dist file.

[Understanding the risk of script injections](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#understanding-the-risk-of-script-injections)
## Using the typescript-action template
[Create a GitHub Action Using TypeScript](https://github.com/actions/typescript-action)

I first initialiased this back in May 2024 but didn't create it back then, so initially it was using [this](https://github.com/actions/typescript-action/tree/c55649f1894ca3da34f7e38d40fa103ce865044a) state of the `typescript-action` template. It looks like it's changed a lot in the year since, so we may as well update this to the [current](https://github.com/actions/typescript-action/tree/1e68449593284f2ee5ffd6679abb32f9e222b3bb) version.
