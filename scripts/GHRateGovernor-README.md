# GitHub Rate Governor (RaptorMini)

This script exposes a `GitHubRateGovernor` class that centralizes rate limiting for GitHub API calls.

Key features:

Usage:

```
const { defaultGovernor, GitHubRateGovernor } = require('../dist/github-rate-governor.js');

(async () => {
  const res = await defaultGovernor.perform('GET', 'https://api.github.com/repos/octokit/core.js');
  console.log(res.status, res.headers['etag']);
})();
```

Notes:
 - Unit tests for behavior are available under `__tests__/` and can be run via `npm test` (requires Node.js + npm).
Run tests locally:

```powershell
cd C:\Users\Hunter\Repos\Github-Solutions
npm ci
npm test
```

Notes:

Contributing & Improvements:
 - Unit tests use Jest + nock and validate ETag per-page caching, 304 handling, token refresh, and pagination helpers.
![CI](https://github.com/Doctor0Evil/Github-Solutions/actions/workflows/ci.yml/badge.svg)
