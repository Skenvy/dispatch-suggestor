# [dispatch-suggestor](https://github.com/Skenvy/dispatch-suggestor)
[![Test](https://github.com/Skenvy/dispatch-suggestor/actions/workflows/main.yaml/badge.svg?branch=main&event=push)](https://github.com/Skenvy/dispatch-suggestor/actions/workflows/main.yaml)

> [!CAUTION]
> This is not yet passed pre-release development and testing. The rest of this README is a preemptive skeleton that is currently meaningless. It will be updated once the initial development is complete.

Suggests dispatchable workflows for a branch that would otherwise trigger the dispatchable workflows from pushes to the trunk.
```yaml
- name: Dispatch 📤 Suggestor 📥
  uses: Skenvy/dispatch-suggestor@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
---
<TODO: explain more detail>

---
## Inputs
### `name-of-input`
* **Required** | _Optional_
* Input description.
* _Optional_ && Default `'abc'`.

---
## Outputs
### `name-of-output`
* Output description.

---
## Example Usage
<TODO: provide and explain all impactful ```yaml``` blocks>

### _Optional:_ The recommended `on:` to use for the workflow
* For a `deployment_branch` of `main`.
* Use `on.pull_request.paths-ignore` if there're any paths you're certain won't ever trigger any other workflow.
```yaml
on:
  pull_request:
    branches:
    - 'main'
```
### **Required:** In jobs.<job_id>.steps[*]
* Prior to the `uses: Skenvy/dispatch-suggestor@v1` step, you'll need to checkout with depth 0, as this action checks the diff against older commits. If you _only_ allow squashes, a checkout depth greater than 1 might be ok, although 0 is recommended.
```yaml
- name: 🏁 Checkout
  uses: actions/checkout@v3
  with:
    fetch-depth: 0
```
### In jobs.<job_id>.steps[*].uses:
* With the deployment branch being `main`, in the least decorated way;
```yaml
- uses: Skenvy/dispatch-suggestor@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    deployment-branch: 'main'
```

---
## A complete example
<TODO: provide a full working ```yaml``` block>
