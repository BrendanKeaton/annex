"use client";

import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";

import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Upload, X } from "lucide-react";

const MAX_IMAGE_SIZE = 512;
const MAX_FILE_SIZE_MB = 5;

export default function OnboardingStep1() {
  const [orgName, setOrgName] = useState("");
  const [subscriptionCode, setSubscriptionCode] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setOrgName(`${session.user.email} Organization`);
      }
    };
    fetchUser();
  }, []);

  const validateImage = (file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        resolve(`File size must be under ${MAX_FILE_SIZE_MB}MB`);
        return;
      }

      if (!file.type.startsWith("image/")) {
        resolve("File must be an image");
        return;
      }

      const img = new window.Image();
      img.onload = () => {
        if (img.width > MAX_IMAGE_SIZE || img.height > MAX_IMAGE_SIZE) {
          resolve(
            `Image dimensions must be ${MAX_IMAGE_SIZE}x${MAX_IMAGE_SIZE} or smaller`,
          );
        } else {
          resolve(null);
        }
      };
      img.onerror = () => resolve("Could not read image file");
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const validationError = await validateImage(file);
    if (validationError) {
      setError(validationError);
      e.target.value = "";
      return;
    }

    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const clearLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = orgName.trim();
    if (!trimmedName) {
      setError("Organization name is required");
      return;
    }
    if (trimmedName.length < 2) {
      setError("Organization name must be at least 2 characters");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Not authenticated");
      }

      const formData = new FormData();
      formData.append("name", trimmedName);
      formData.append("subscription_code", subscriptionCode.trim());
      if (logoFile) {
        formData.append("logo", logoFile);
      }

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/auth/onboarding/organization`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to create organization");
      }

      await supabase.auth.refreshSession();
      router.push("/onboarding/2");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-12 sm:px-16 lg:px-24">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <div>
          <h1 className="text-4xl font-semibold text-annex-white font-mono">
            Your organization
          </h1>
          <p className="mt-2 text-sm text-annex-dark-gray">
            Set up your organization to get started
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid gap-2">
            <Label htmlFor="orgName" className="text-sm text-annex-dark-gray">
              Organization name
            </Label>
            <Input
              id="orgName"
              type="text"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="My Organization"
              className="h-11 rounded-md border-annex-border-light/30 bg-annex-background-light text-annex-white placeholder:text-annex-light-gray"
            />
          </div>

          <div className="grid gap-2">
            <Label className="text-sm text-annex-dark-gray">
              Logo{" "}
              <span className="text-annex-light-gray">
                (optional, max 512x512)
              </span>
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            {logoPreview ? (
              <div className="relative w-24 h-24">
                <Image
                  width={512}
                  height={512}
                  src={logoPreview}
                  alt="Logo preview"
                  className="w-24 h-24 rounded-lg object-cover border border-annex-border-light/30"
                />
                <button
                  type="button"
                  onClick={clearLogo}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-annex-background-light border border-annex-border-light/30 flex items-center justify-center hover:bg-annex-light-red/20 transition-colors"
                >
                  <X className="w-3 h-3 text-annex-white" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-3 w-full h-24 rounded-md border border-dashed border-annex-border-light/30 bg-annex-background-light text-sm text-annex-dark-gray hover:border-annex-purple/50 hover:text-annex-white transition-colors px-4"
              >
                <Upload className="w-5 h-5 shrink-0" />
                <span>Click to upload a logo</span>
              </button>
            )}
          </div>

          <div className="grid gap-2">
            <Label
              htmlFor="subscriptionCode"
              className="text-sm text-annex-dark-gray"
            >
              Subscription code
            </Label>
            <Input
              id="subscriptionCode"
              type="text"
              required
              value={subscriptionCode}
              onChange={(e) => setSubscriptionCode(e.target.value)}
              placeholder="Enter your subscription code"
              className="h-11 rounded-md border-annex-border-light/30 bg-annex-background-light text-annex-white placeholder:text-annex-light-gray"
            />
            <p className="text-xs text-annex-light-gray">
              Enter the code provided to you to activate your plan.
            </p>
          </div>

          {error && <p className="text-sm text-annex-light-red">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 rounded-md bg-annex-dark-purple border border-annex-light-purple text-annex-light-purple text-sm font-semibold hover:opacity-70 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isLoading ? "Creating organization..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
