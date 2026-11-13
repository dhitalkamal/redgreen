# How to prove your change

redgreen runs the tests your pull request adds or changes twice: once on the code before your change, and once with it. A test proves your change when it fails before and passes after.

## Writing a test that proves a fix

1. Write the test first and run it on the current code. It should fail for the right reason: an assertion about the wrong behavior, not a missing file.
2. Apply your fix. The same test should now pass.
3. Commit the test together with the fix.

## What each result means

- No proof: no test fails without your code changes and passes with them, so the tests do not exercise what you changed. Make the assertion check the new behavior. If a new test fails even with your change, fix that test first.
- No proof yet: your pull request has no test changes. Add a test, or explain in the pull request why none is possible (for example docs or a pure refactor).
- Breaks tests: tests that passed before fail with your change. Fix them, or explain why the old behavior was wrong.
- Inconclusive: redgreen could not compare cleanly, and the comment says why. This usually needs a maintainer to adjust the setup.
- Unverified: your pull request changes CI or test configuration, so redgreen cannot trust its own result. A maintainer will review it by hand.

## Support files

If a test needs a new data file, put it where test files live: `tests/`, `fixtures/`, `testdata/`, or `__snapshots__/`. Anywhere else, redgreen removes it together with your code change, and the test fails for the wrong reason.
