# [dispatch-suggestor](https://github.com/Skenvy/dispatch-suggestor)
[![Test](https://github.com/Skenvy/dispatch-suggestor/actions/workflows/main.yaml/badge.svg?branch=main&event=push)](https://github.com/Skenvy/dispatch-suggestor/actions/workflows/main.yaml)
[![Action Tests](https://github.com/Skenvy/dispatch-suggestor/actions/workflows/action-test.yaml/badge.svg)](https://github.com/Skenvy/dispatch-suggestor/actions/workflows/action-test.yaml)

See it on the 🏪 [marketplace](https://github.com/marketplace/actions/dispatch-suggestor).

---

Suggests dispatchable workflows for a branch that would _otherwise_ trigger the dispatchable workflows from pushes to the trunk.
```yaml
- name: Dispatch 📤 Suggestor 📥
  uses: Skenvy/dispatch-suggestor@v1
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
```
Embed the action in a workflow triggered on `pull_request` events, and it will determine a list of workflows with `workflow_dispatch` triggers that _would also be_ triggered on `push` to the trunk branch (but that _aren't_ triggered by `push`ing to the PR's head branch).

E.g. if you have several `workflow_dispatch` based workflows that are each also triggered by pushes to the trunk branch but limited to specific file triggers, this action will evaluate the changes in the PR and determine _for each dispatchable workflow_ if they are relevant or not, and then suggest the ones it considers relevant.

## Inputs
### `github_token`
* **Required**
* Requires that the workflow or job have `permissions` set to at least
  ```yaml
  permissions:
    actions: read
    contents: read
    pull-requests: write
  ```
### `trunk-branch`
* _Optional_
* Name of the trunk branch, if not main.
* Default `'main'`.
### `checkout-root`
* _Optional_
* The path to the root folder of the checked out repo, relative to the default working-directory, `$GITHUB_WORKSPACE`. It should be the same as the value provided to `@actions/checkout` `with.path:`, or default.
* Default `'.'`.

## Inputs -- less common and logging options
### `log-event-payload`
* _Optional_
* If not false, will print the whole triggering event payload.
* Default `'false'`.
### `log-workflow-triggers`
* _Optional_
* If not false, will print the triggers for all dispatchable workflows.
* Default `'false'`.
### `comment-unique-identifier`
* _Optional_
* A hidden string the action can use to identify any previously written comment, to edit it rather than add indefinitely. Only useful if you're using this action with multiple configurations on the same PR.
* Default `'DEFAULT_COMMENT_UNIQUE_IDENTIFIER'`.
### `inject-diff-paths`
* _Optional_
* A comma-separated list of paths to inject into the list of changed files.
* Default `''`.
### `vvv`
* _Optional_
* Very very verbose. Include debugging logs.
* Default `'false'`.

## Outputs
### `list-of-changed-files`
* A list of the files that have been touched by this PR.
### `list-of-dispatchable-workflows`
* A list of the workflows found in this repo that have `workflow_dispatch` triggers.

## Example Usage
### The recommended `on:` to use for the workflow
* For a `deployment_branch` of `main`.
* Use `on.pull_request.paths-ignore` if there're any paths you're certain won't ever trigger any other workflow.
```yaml
on:
  pull_request:
    branches:
    - 'main'
```
### **Checkout:** In `jobs.<job_id>.steps[*]`
* Prior to the `uses: Skenvy/dispatch-suggestor@v1` step, you'll need to `checkout`, as this action checks the local state of workflows.
```yaml
- name: 🏁 Checkout
  uses: actions/checkout@v4
  with:
    sparse-checkout: |
      .github/workflows/*.y*ml
    sparse-checkout-cone-mode: false
```
### **_this_**: In `jobs.<job_id>.steps[*].uses`:
* With the deployment branch being `main`, and the `checkout` above, in the least decorated way;
```yaml
- uses: Skenvy/dispatch-suggestor@v1
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
```

## A complete example
See this example [here](https://github.com/Skenvy/dispatch-suggestor/blob/main/.github/workflows/example.yml).

[![example workflow badge](https://github.com/Skenvy/dispatch-suggestor/actions/workflows/example.yml/badge.svg)](https://github.com/Skenvy/dispatch-suggestor/actions/workflows/example.yml)
```yaml
name: Dispatch 📤 Suggestor 📥
on:
  pull_request:
permissions:
  actions: read
  contents: read
  pull-requests: write
jobs:
  suggestor:
    name: Dispatch 📤 Suggestor 📥
    runs-on: 'ubuntu-latest'
    steps:
    - name: 🏁 Checkout
      uses: actions/checkout@v4
      with:
        sparse-checkout: |
          .github/workflows/*.y*ml
        sparse-checkout-cone-mode: false
    - name: Dispatch 📤 Suggestor 📥
      id: dispatch-suggestor
      uses: Skenvy/dispatch-suggestor@v1
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
    - name: List changed files
      run: echo "${{ steps.dispatch-suggestor.outputs.list-of-changed-files }}"
    - name: List dispatchable workflows
      run: echo "${{ steps.dispatch-suggestor.outputs.list-of-dispatchable-workflows }}"
```
