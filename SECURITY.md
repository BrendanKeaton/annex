# Security Policy

This is an **educational experiment, not intended for production or real-world
use** (see the README). It is unaudited and almost certainly has security
issues — that's expected for a learning project. There is **no guaranteed
response time and no commitment to fixes**, but reports are still welcome and
will be looked at when time allows.

## Reporting a vulnerability

**Please don't open a public issue for a vulnerability.** Use GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
— the **"Report a vulnerability"** button under the repository's **Security**
tab. GitHub is the only support/contact channel for this project.

Helpful details: what the issue is, how to reproduce it, and the affected
component/commit.

## Notes

- No supported-version guarantees. Fixes (if any) land on `main`; pin to a
  commit if you need stability.
- Never commit real secrets — all `.env` files are gitignored; use the
  `.env.example` templates.
- The self-hosted Supabase stack in `infra/supabase/` ships with **insecure
  default secrets** in `.env.example`. Generate fresh secrets
  (`infra/supabase/utils/generate-keys.sh`) before exposing it anywhere.
