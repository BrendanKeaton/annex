# Annex

Encrypts your sensitive files while a local AI agent is running, so the agent
can't read what it shouldn't.

> **Status: unaudited research prototype — do not use it to protect real data.**
>
> This was written to explore a design and to accompany a blog post. The
> cryptography has had no independent review. It may be broken in ways I
> haven't found. It can lose your files. Do not deploy it, do not rely on it,
> and do not use it as a security control for anything that matters. Provided
> as-is under the MIT license, with no warranty and no support.

## What it does

Mark the files an agent shouldn't touch — `.env`s, PII, test files. Start a
session and Annex encrypts them with AES-256-GCM, filenames included, then
securely destroys the originals. Run your agent normally. End the session with
your PIN and everything is restored and checksum-verified.

The threat is a local coding agent with your filesystem permissions —
misbehaving, prompt-injected, or just over-indexing. `.llmignore` is a handshake
agreement; nothing enforces it. Ciphertext under a randomized name has nothing
to read.

It does not defend against a targeted attacker with device access, memory reads
during an active session, or exfiltration of data the agent already had.

Blog post here: https://blog.brendankeaton.com/self-service-ransomware-as-security-against-local-ai-tools

## Structure

- **apps/desktop** — Tauri + SolidJS. Encryption, secure deletion, and
  zeroization live here.
- **apps/backend** — Python/FastAPI. Key derivation, session state, manifests.
- **apps/webapp** — Next.js. Account management.
- **infra/supabase** — Self-hosted Supabase stack (Postgres, Auth, REST,
  Storage); see [infra/supabase/RUNBOOK.md](infra/supabase/RUNBOOK.md).
- **packages/** — Shared packages (coming soon)

Repo history was not preserved; this is a clean re-import of a private working tree.

## Running it

Requires Docker, Node/npm, Python 3, and Rust. `start-local.sh` brings up the
self-hosted Supabase stack and the apps; `stop-local.sh` tears it down. Read
both before running either — `--wipe` is destructive, and Supabase is stateful
and will keep running after you `Ctrl+C` the apps.

## Known limitations

- The FastAPI server secret is a single trust anchor for key derivation.
- Encryption is all-or-nothing per file.
- No egress control — this protects data at rest, not data in flight.
- Editor temp-file coverage (`.bak`, `.swp`, VS Code backups) is best-effort, and far from guaranteed.

## License

[MIT](LICENSE)
