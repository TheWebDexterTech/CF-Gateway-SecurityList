# Security Policy

## Supported Versions

Only the latest commit on `main` is supported. Sync scripts run on a
schedule via GitHub Actions, so there are no separate release branches to
maintain.

## Reporting a Vulnerability

If you discover a security vulnerability in this project (e.g. a way to
leak Cloudflare credentials, inject data into the Gateway API requests, or
otherwise compromise the sync workflow), please report it privately using
[GitHub's private vulnerability reporting](../../security/advisories/new)
for this repository instead of opening a public issue.

Please include:

- A description of the vulnerability and its potential impact.
- Steps to reproduce, or a minimal proof of concept.
- Any relevant logs (with secrets redacted).

We'll acknowledge reports as soon as possible and aim to ship a fix
promptly given the small scope of this project.

## Security Measures

- Cloudflare credentials are only ever read from environment variables /
  GitHub Actions secrets - never logged or committed.
- All Cloudflare API requests use a bounded timeout and automatic
  retry-with-backoff on rate limiting (`429`) and `5xx` errors.
- API responses used to build Gateway rule expressions are validated
  (resource IDs must match Cloudflare's UUID format) before being
  interpolated into a wirefilter expression.
- `npm ci --ignore-scripts` is used in CI, and `npm audit signatures`
  verifies package provenance against the npm registry on every run.
- Dependabot keeps npm dependencies and GitHub Actions up to date weekly.
- CodeQL static analysis runs on every push/PR to `main` and weekly on a
  schedule.
- The sync workflow's `GITHUB_TOKEN` is scoped to `contents: read` only.
