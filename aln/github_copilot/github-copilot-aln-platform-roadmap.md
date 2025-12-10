# 10 platform-wide actions for GitHub + ALN

## Overview

These 10 actions turn ALN into a first-class governance, validation, and feedback layer across GitHub, improving Copilot reliability, security, and repo hygiene. They assume Ajv-based validation for JSON artifacts and GitHub-native CI/CD as the primary control plane.

---

## 1) Native "ALN schema profile" for repositories

- Add a first-class `.github/aln/profile.aln` that GitHub recognizes as a configuration source for validation, security scanning, and Copilot orchestration.
- Expose this profile in the repo Settings UI so maintainers can toggle which JSON schema sets, security rule-sets, and feedback workflows are enforced by default.

---

## 2) Built-in Ajv validation action preset

- Ship an official `github/aln-validate-json@v1` composite action that wraps Ajv CLI or an Ajv service, including support for glob patterns and multiple schemas.
- Allow the preset to auto-discover schema roots (for example, `schemas/**/*.schema.json`) and wire them to data patterns via a minimal ALN mapping file.

---

## 3) Repository-wide JSON safety gates

- Offer a "Validate JSON before merge" toggle in branch protection that auto-injects a mesh-sweep Ajv step using the official action and stored ALN profile mappings.
- Let maintainers define severity for schema failures (block, warn, or log-only) so experimental branches can run permissive validation while main branches stay strict.

---

## 4) Copilot + ALN metaprompt contract

- Extend Copilot's repo onboarding to read the ALN profile and construct a standard metaprompt (constraints, security rules, test expectations) injected into each new session.
- Provide a simple "Copilot governance status" panel in GitHub that shows which ALN plans, schemas, and security rule sets are active for Copilot in that repo.

---

## 5) Standardized multi-file edit plans

- Define an ALN spec for `copilot_edit_plan` entities (files_in_scope, invariants, test expectations) and let users attach them to issues and PRs.
- Teach Copilot to prioritize these plans when generating diffs, keeping edits inside the declared file set and invariants, which strengthens safety and reviewability.

---

## 6) First-class security severity gates

- Add a generic `aln_severity_gate` configuration in the repo ALN profile that maps scanners' JSON outputs to GitHub Checks with severity-aware pass/fail logic.
- Provide default bindings for common formats (for example, SARIF, custom JSON) and make them visible in the Security tab so teams can tune thresholds without editing YAML.

---

## 7) Feedback loops: Copilot QoS metrics

- Introduce a "Copilot Quality Signals" dashboard combining suggestion-acceptance proxies, revert rates, and post-merge test failures, keyed by ALN plan IDs and repositories.
- Allow ALN profiles to specify thresholds (for example, max failure rate per plan) that automatically adjust Copilot aggressiveness or trigger review requirements.

---

## 8) Ajv-powered schema and config marketplace

- Curate a marketplace of reusable ALN schema packs for typical GitHub configs (Actions workflows, Dependabot, CodeQL, Renovate, tool-specific configs) validated with Ajv.
- Let repos declare dependencies on these packs in their ALN profile so JSON validation flows can be updated centrally with new schema versions.

---

## 9) Deep IDE integration via ALN signals

- Extend GitHub's IDE extensions to surface ALN-derived hints inline: config validation errors from Ajv, missing tests for a plan, or security invariants relevant to the current file.
- Allow "Fix with Copilot under ALN plan" commands that open targeted sessions respecting the plan's invariants, rather than generic free-form chat.

---

## 10) Organization-level ALN governance templates

- Let organizations define ALN blueprints (validation, security gates, Copilot plans, feedback workflows) and apply them to many repos with overrides per project.
- Provide drift detection that flags repos diverging from the org's ALN template (for example, weakened severity gates or disabled Ajv sweeps) and suggests remediation PRs.

---

## Implementation priorities

1. **Immediate**: Actions 1-3 (native ALN profiles, Ajv preset, JSON safety gates) establish the foundation.
2. **Near-term**: Actions 4-6 (Copilot metaprompt, edit plans, severity gates) add governance intelligence.
3. **Medium-term**: Actions 7-9 (QoS metrics, schema marketplace, IDE integration) enable continuous improvement.
4. **Long-term**: Action 10 (org-level templates) scales ALN governance across enterprises.

---

## Benefits

- **Reliability**: Schema validation and severity gates prevent malformed configs and high-risk changes.
- **Security**: ALN-driven security rules and secret scanning create layered defense.
- **Productivity**: Copilot sessions governed by ALN reduce iteration cycles and suggestion drift.
- **Observability**: QoS feedback loops surface quality issues and drive prompt tuning.
- **Scale**: Organization templates ensure consistent governance across hundreds of repos.
