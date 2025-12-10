# Lint Rules for Control Flow Regressions

This document outlines a minimal set of linting/analysis rules to detect emerging control flow regressions.

- Use Semgrep rules (`scripts/semgrep/semantic-drift-rules.yml`) for high-level patterns like missing default branches, catch-all exception handlers, or unguarded if-statements.
- Add ESLint custom rules for project-specific patterns (example at `scripts/eslint/no-unguarded-if.js`).
- In CI: run both ESLint and Semgrep; fail pipeline for high-severity findings.

Example CI step:

```
- name: Run semgrep
  run: semgrep --config scripts/semgrep/semantic-drift-rules.yml

- name: Lint
  run: npm run lint
```

Implement plugin: copy `scripts/eslint/no-unguarded-if.js` into your eslint plugins dir or convert it into a plugin.
