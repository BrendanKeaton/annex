// Dev builds: read from runtime environment (populated from .env via dotenvy in lib.rs).
// Release builds: values are baked at compile time via `option_env!`. The build will
// succeed without them set, but the app will panic at startup with a clear message.

pub fn api_url() -> String {
    #[cfg(debug_assertions)]
    {
        std::env::var("API_URL").unwrap_or_else(|_| "http://localhost:8000".to_string())
    }
    #[cfg(not(debug_assertions))]
    {
        option_env!("API_URL")
            .expect(
                "API_URL must be set at compile time for release builds. \
                 Build with: API_URL=https://... npm run tauri build",
            )
            .to_string()
    }
}

pub fn supabase_url() -> Result<String, String> {
    #[cfg(debug_assertions)]
    {
        std::env::var("SUPABASE_URL")
            .map_err(|_| "SUPABASE_URL is not set in environment".to_string())
    }
    #[cfg(not(debug_assertions))]
    {
        Ok(option_env!("SUPABASE_URL")
            .expect(
                "SUPABASE_URL must be set at compile time for release builds. \
                 Build with: SUPABASE_URL=https://... npm run tauri build",
            )
            .to_string())
    }
}

pub fn desktop_callback_url() -> String {
    #[cfg(debug_assertions)]
    {
        std::env::var("DESKTOP_CALLBACK_URL")
            .expect("DESKTOP_CALLBACK_URL must be set in the environment (.env)")
    }
    #[cfg(not(debug_assertions))]
    {
        option_env!("DESKTOP_CALLBACK_URL")
            .expect(
                "DESKTOP_CALLBACK_URL must be set at compile time for release builds. \
                 Build with: DESKTOP_CALLBACK_URL=https://... npm run tauri build",
            )
            .to_string()
    }
}
