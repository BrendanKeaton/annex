import { createSignal, createEffect, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "@solidjs/router";
import google_icon from "../assets/google_icon.png";
import PrimaryButton from "../components/primary_button";
import { openUrl } from "@tauri-apps/plugin-opener";
import ArrowRightIcon from "../components/icons/arrow_right";
import { useAppState } from "../context/app_state";

export default function Auth() {
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const navigate = useNavigate();
  const [state] = useAppState();

  createEffect(() => {
    if (state.is_authenticated && state.user_email) {
      navigate("/app/session");
    }
  });

  const unlisten = listen<string>("oauth-error", (event) => {
    setError(event.payload ?? "Google sign-in failed. Please try again.");
  });
  onCleanup(() => unlisten.then((fn) => fn()));

  async function handleLogin(e: Event) {
    e.preventDefault();
    setError("");

    try {
      await invoke("login", {
        email: email(),
        password: password(),
      });
    } catch (err) {
      setError(
        typeof err === "string" ? err : "Login failed. Please try again.",
      );
    }
  }

  return (
    <main class="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4">
      <div class="w-full flex-1 justify-center flex flex-col gap-6 min-w-sm text-center">
        <div class="bg-annex-background px-10 py-16 rounded-md border border-annex-light-gray gap-y-6 flex flex-col mt-4">
          <h1 class="text-2xl font-light text-white mb-6">
            Welcome to Annex
            <span class="text-annex-light-purple text-5xl leading-0">.</span>
          </h1>{" "}
          <form class="flex flex-col gap-4" onSubmit={handleLogin}>
            <input
              type="email"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              placeholder="Email"
              class="w-full px-4 py-3 rounded-lg bg-white/10 text-white placeholder-white/40 outline-none focus:ring-1 focus:ring-annex-white"
            />
            <input
              type="password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              placeholder="Password"
              class="w-full px-4 py-3 rounded-lg bg-white/10 text-white placeholder-white/40 outline-none focus:ring-1 focus:ring-annex-white"
            />
            <PrimaryButton
              title="Sign In"
              onClick={() => {
                handleLogin(new Event("submit"));
              }}
              icon={<ArrowRightIcon class="text-annex-light-purple w-4 h-4" />}
            ></PrimaryButton>
          </form>
          <div class="flex items-center gap-3">
            <div class="flex-1 h-px bg-white/20" />
            <span class="text-sm text-white/40">or</span>
            <div class="flex-1 h-px bg-white/20" />
          </div>
          <button
            class="flex items-center justify-center gap-2 py-3 rounded-lg bg-white/10 hover:bg-white/15 transition-colors cursor-pointer"
            onClick={async () => {
              setError("");
              try {
                await invoke("login_with_google");
              } catch (err) {
                setError(
                  typeof err === "string"
                    ? err
                    : "Failed to open Google sign-in.",
                );
              }
            }}
          >
            <img src={google_icon} class="w-5 h-5" alt="Google" />
            <span class="text-white text-sm">Continue with Google</span>
          </button>
          <a
            class="underline underline-offset-4 text-annex-dark-gray text-sm cursor-pointer"
            onClick={() => openUrl("https://github.com/your-org/annex")}
          >
            don't have an account?
          </a>
        </div>
      </div>
      {error() && <p class="text-red-400 text-sm max-w-md">{error()}</p>}
    </main>
  );
}
