"use client";

import { useEffect, useState } from "react";

type Status = "loading" | "success" | "error";

export default function DesktopCallbackPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deepLinkUrl, setDeepLinkUrl] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.slice(1); // strip leading #

    if (!hash) {
      setErrorMessage("Something went wrong, please try again.");
      setStatus("error");
      return;
    }

    const params = new URLSearchParams(hash);
    const error = params.get("error_description") ?? params.get("error");

    if (error) {
      setErrorMessage(error);
      setStatus("error");
      return;
    }

    const scheme =
      process.env.NEXT_PUBLIC_DESKTOP_URL_SCHEME || "annex";
    const url = `${scheme}://auth/callback#${hash}`;
    setDeepLinkUrl(url);
    window.location.href = url;
    setStatus("success");
  }, []);

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col gap-4 text-center">
        {status === "loading" && (
          <p className="text-sm text-annex-dark-gray">
            Redirecting to Annex...
          </p>
        )}
        {status === "success" && (
          <>
            <h1 className="text-2xl font-semibold text-annex-white font-mono">
              You&apos;re signed in!
            </h1>
            <p className="text-sm text-annex-dark-gray">
              You can close this tab.
            </p>
            {deepLinkUrl && (
              <p className="text-sm text-annex-dark-gray">
                If Annex didn&apos;t open automatically,{" "}
                <a
                  href={deepLinkUrl}
                  className="text-annex-white underline underline-offset-4 hover:text-annex-light-purple transition-colors"
                >
                  click here to open it
                </a>
                .
              </p>
            )}
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="text-2xl font-semibold text-annex-white font-mono">
              Something went wrong.
            </h1>
            <p className="text-sm text-annex-dark-gray">{errorMessage}</p>
          </>
        )}
      </div>
    </div>
  );
}
