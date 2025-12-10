const { defaultGovernor } = require('../dist/github-rate-governor.js');

async function test() {
  const url = 'https://api.github.com/repos/octokit/core.js';
  const headers = {
    Accept: 'application/vnd.github+json',
  };

  console.log('Sending 10 concurrent requests via governor...');
  const jobs = [];
  for (let i = 0; i < 10; i++) {
    jobs.push((async (index) => {
      const res = await defaultGovernor.perform('GET', url, headers, null, { etag_key: 'octokit-core' });
      console.log(`#${index} status=${res.status} remaining=${defaultGovernor.remainingLimit} resetAt=${defaultGovernor.resetAt}`);
      return res;
    })(i));
  }

  const results = await Promise.all(jobs);
  console.log('Requests complete. Summaries:');
  results.forEach((r, idx) => console.log(`#${idx} status=${r.status}`));
}

(async () => {
  try {
    await test();
  } catch (err) {
    console.error('Test failed', err);
    process.exit(1);
  }
})();
