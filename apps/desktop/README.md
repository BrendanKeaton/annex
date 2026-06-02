# Annex

A Tauri + SolidJS + TypeScript desktop app that encrypts protected files
during active sessions to keep local AI tooling from reading them.

## Stack

- [Tauri 2](https://tauri.app/) (Rust shell)
- [SolidJS](https://www.solidjs.com/) + [Solid Router](https://github.com/solidjs/solid-router)
- [Tailwind CSS v4](https://tailwindcss.com/) (via `@tailwindcss/vite`)
- [Vite](https://vite.dev/)

## Prerequisites

- Node.js 20+
- Rust (stable) via [rustup](https://rustup.rs/)
- Platform build deps for Tauri — see the
  [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)

## Configuration

Copy the env template and fill in your own backend / Supabase values:

```sh
cp src-tauri/.env.example src-tauri/.env
```

Required variables:

| Variable               | Purpose                                                |
|------------------------|--------------------------------------------------------|
| `API_URL`              | Annex backend API base URL                             |
| `SUPABASE_URL`         | Supabase project URL used for auth                     |
| `DESKTOP_CALLBACK_URL` | OAuth redirect target that hands the token to the app  |

In dev these are loaded at runtime via `dotenvy`. In release builds they are
baked at compile time via `option_env!` — the build will succeed without them
but the app will refuse to start with a clear error.

## Development

```sh
npm install
npm run tauri dev
```

## Building a release bundle

```sh
API_URL=... SUPABASE_URL=... DESKTOP_CALLBACK_URL=... npm run tauri build
```

Platform installers are written to `src-tauri/target/release/bundle/`.

## License

MIT — see [LICENSE](../LICENSE).
