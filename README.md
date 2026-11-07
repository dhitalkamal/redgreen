# redgreen

Red without the change, green with it.

redgreen is a GitHub Action for maintainers. It checks whether a pull request's tests prove its change: the tests the pull request adds or changes should fail on the code before the change and pass with it. It posts one comment, one check, and one label per pull request.

It runs in your repository's own GitHub Actions minutes. There is no service, no account, and no AI.

## How it works

- Stage 1, `check`, runs in a read-only `pull_request` job after your usual setup steps. It runs your tests with the change, puts the non-test files back to the base branch, runs the tests again, restores everything, and compares the two runs test by test using JUnit XML.
- Stage 2, `report`, runs from your default branch with permission to comment. It never runs pull request code. It validates the results, confirms they came from the right run, and publishes. Results are rejected, with a neutral "results rejected" check, when they are stale (the pull request head moved on after the run) or when the head repository is unknown (for example a deleted fork).

## Quick start

Add `docs/templates/redgreen.yml` and `docs/templates/redgreen-report.yml` to `.github/workflows/`. In the first file, replace the setup steps and `test-command` with your project's own. Replace `OWNER` with the publisher's account.

## Verdicts

| Verdict | Meaning |
|---|---|
| Proof found | At least one test fails without the change and passes with it |
| No proof | The pull request's tests pass even without its code changes |
| No proof yet | The pull request adds or changes no tests |
| Breaks tests | Tests that passed before fail with the change |
| Inconclusive | No clean comparison was possible; the comment says why |
| Unverified | The pull request changes CI or test configuration, so the result cannot be trusted |

## check inputs

| Input | Default | Purpose |
|---|---|---|
| `test-command` | required | Command that runs the tests |
| `junit-path` | none | Glob for JUnit XML files; enables per-test results |
| `install-command` | none | Reinstalls dependencies when a pull request changes them |
| `test-patterns` | built-in | Replaces the test file patterns |
| `extra-test-patterns` | none | Adds to the test file patterns |
| `dependency-patterns` | built-in | Replaces the dependency file patterns |
| `run-timeout-minutes` | 20 | Time limit for each test run |
| `retries` | 0 | Extra repeats of each run to detect flaky tests |
| `run-without-test-changes` | false | Run even when no test files changed |
| `max-changed-files` | 3000 | Above this, the result is inconclusive |

## report inputs

| Input | Default | Purpose |
|---|---|---|
| `github-token` | the workflow token | Reads the artifact and writes the comment, check and label |
| `check-workflow` | `.github/workflows/redgreen.yml` | The stage 1 workflow that must have produced the results |
| `mode` | advisory | `advisory` never fails the check; `blocking` fails it for results in `block-on` |
| `block-on` | no-proof, breaks-tests | Results that fail the check in blocking mode |
| `labels` | true | Apply proof labels |
| `label-prefix` | `proof: ` | Label prefix |
| `comment` | true | Post the pull request comment |
| `skip-authors` | Dependabot, Renovate, GitHub Actions | Authors to skip |
| `skip-drafts` | false | Skip draft pull requests |
| `trust-patterns` | built-in | Paths that make results unverified when a pull request changes them |
| `guide-url` | this repo's guide | Link to the contributor guide |

## What redgreen can and cannot tell you

- Proof means the tests depend on the change. It does not mean the change is correct or wanted.
- Stage 1 runs pull request code, so a determined attacker could forge its results. redgreen marks pull requests that change workflows or test configuration as unverified. Treat proof as evidence for review, never as permission to merge.
- Tests inside source files, such as Rust inline tests, cannot count as proof yet.
- Pull requests that change dependencies need `install-command`.
- Pull requests from forks get no secrets, so tests that need secrets are ignored.
- Test time doubles for pull requests that change tests.

## License

Apache-2.0. See LICENSE.
