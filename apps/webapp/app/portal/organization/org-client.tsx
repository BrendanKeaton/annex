"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

interface OrgMember {
  user_id: string;
  email: string;
  role: "admin" | "member";
  joined_at: string;
  file_count: number;
}

interface OrgInfo {
  name: string;
  plan_name: string;
  max_users: number;
  max_files_stored: number;
  current_files_stored: number;
  is_active: boolean;
}

type SortField = "email" | "joined_at" | "file_count";
type SortDir = "asc" | "desc";

export function OrgClient() {
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [sortField, setSortField] = useState<SortField>("joined_at");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);

  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const info = await apiFetch<OrgInfo>(`/org/info`);
      setOrgInfo(info);

      // Members endpoint returns 403 for non-admins — treat that as isAdmin=false
      try {
        const memberList = await apiFetch<{ members: OrgMember[] }>(`/org/members`);
        setMembers(memberList.members);
        setIsAdmin(true);
      } catch {
        setIsAdmin(false);
        setMembers([]);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load organization data",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sortedMembers = [...members].sort((a, b) => {
    let cmp = 0;
    if (sortField === "email") {
      cmp = a.email.localeCompare(b.email);
    } else if (sortField === "joined_at") {
      cmp = new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
    } else if (sortField === "file_count") {
      cmp = a.file_count - b.file_count;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  async function handleRemove(userId: string) {
    if (removeConfirm !== userId) {
      setRemoveConfirm(userId);
      return;
    }
    setRemovingId(userId);
    setRemoveError("");
    setRemoveConfirm(null);
    try {
      await apiFetch(`/org/members/${userId}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (err: unknown) {
      setRemoveError(
        err instanceof Error ? err.message : "Failed to remove member",
      );
    } finally {
      setRemovingId(null);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError("");
    setInviteSuccess(false);
    try {
      await apiFetch<{ status: boolean }>(`/org/invite`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      setInviteSuccess(true);
      setInviteEmail("");
      setTimeout(() => setInviteSuccess(false), 4000);
    } catch (err: unknown) {
      setInviteError(
        err instanceof Error ? err.message : "Failed to send invite",
      );
    } finally {
      setInviting(false);
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) {
      return <span className="text-white/20 ml-1">↕</span>;
    }
    return (
      <span className="text-annex-purple ml-1">
        {sortDir === "asc" ? "↑" : "↓"}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center px-6 py-12 sm:px-12 lg:px-24">
        <div className="w-full max-w-3xl flex flex-col gap-4">
          <div className="h-8 w-40 bg-white/5 rounded animate-pulse" />
          <div className="h-4 w-64 bg-white/5 rounded animate-pulse" />
          <div className="h-48 w-full bg-white/5 rounded animate-pulse mt-4" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center px-6 py-12 sm:px-12 lg:px-24">
        <div className="w-full max-w-3xl">
          <h1 className="text-2xl font-mono font-semibold text-white mb-2">
            Organization
          </h1>
          <p className="text-sm text-annex-light-red">{error}</p>
          <button
            onClick={fetchData}
            className="mt-4 text-sm font-mono text-annex-purple hover:text-annex-light-purple transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-6 py-12 sm:px-12 lg:px-24">
      <div className="w-full max-w-3xl flex flex-col gap-10">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-mono font-semibold text-white">
            Organization
          </h1>
          {orgInfo && (
            <p className="text-sm text-annex-dark-gray mt-1">{orgInfo.name}</p>
          )}
        </div>

        {/* Org Info */}
        {orgInfo && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-mono font-medium text-annex-dark-gray uppercase tracking-wider">
              Overview
            </h2>
            <div className="rounded-lg border border-white/8 bg-white/2 p-5 grid grid-cols-2 gap-x-8 gap-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-annex-dark-gray">Plan</span>
                <span className="text-sm text-white font-mono">
                  {orgInfo.plan_name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-annex-dark-gray">Status</span>
                <span
                  className={`text-sm font-mono ${orgInfo.is_active ? "text-annex-light-green" : "text-annex-light-red"}`}
                >
                  {orgInfo.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-annex-dark-gray">Members</span>
                <span className="text-sm text-white font-mono">
                  {members.length} / {orgInfo.max_users}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-annex-dark-gray">
                  Files stored
                </span>
                <span className="text-sm text-white font-mono">
                  {orgInfo.current_files_stored.toLocaleString()} /{" "}
                  {orgInfo.max_files_stored.toLocaleString()}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Members — admin only */}
        {isAdmin && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-mono font-medium text-annex-dark-gray uppercase tracking-wider">
                Members
              </h2>
              <button
                onClick={() => setShowInviteForm((v) => !v)}
                className="text-sm font-mono text-annex-purple hover:text-annex-light-purple transition-colors cursor-pointer"
              >
                {showInviteForm ? "Cancel" : "+ Invite"}
              </button>
            </div>

            {/* Invite form */}
            {showInviteForm && (
              <form
                onSubmit={handleInvite}
                className="rounded-lg border border-white/8 bg-white/2 p-4 flex flex-col gap-3 animate-fadeIn"
              >
                <p className="text-xs text-annex-dark-gray">
                  Enter the email address of the person you&apos;d like to
                  invite. They&apos;ll receive a magic link to join your
                  organization.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    required
                    placeholder="user@example.com"
                    value={inviteEmail}
                    onChange={(e) => {
                      setInviteEmail(e.target.value);
                      setInviteError("");
                      setInviteSuccess(false);
                    }}
                    className="flex-1 text-sm font-mono text-white bg-white/4 rounded px-3 py-2 border border-white/8 placeholder:text-white/20 focus:outline-none focus:border-annex-purple"
                  />
                  <button
                    type="submit"
                    disabled={inviting || !inviteEmail.trim()}
                    className="text-sm font-mono text-annex-purple hover:text-annex-light-purple transition-colors cursor-pointer whitespace-nowrap disabled:text-annex-dark-gray disabled:cursor-default"
                  >
                    {inviting ? "Sending..." : "Send invite"}
                  </button>
                </div>
                {inviteSuccess && (
                  <p className="text-xs text-annex-light-green animate-fadeIn">
                    Invite sent successfully.
                  </p>
                )}
              </form>
            )}

            {inviteError && (
              <p className="text-xs text-annex-light-red animate-fadeIn">
                {inviteError}
              </p>
            )}

            {removeError && (
              <p className="text-xs text-annex-light-red animate-fadeIn">
                {removeError}
              </p>
            )}

            {/* Members table */}
            <div className="rounded-lg border border-white/8 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8 bg-white/2">
                    <th className="text-left px-4 py-3">
                      <button
                        onClick={() => handleSort("email")}
                        className="font-mono text-xs text-annex-dark-gray uppercase tracking-wider hover:text-white transition-colors cursor-pointer flex items-center"
                      >
                        Email <SortIcon field="email" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3">
                      <span className="font-mono text-xs text-annex-dark-gray uppercase tracking-wider">
                        Role
                      </span>
                    </th>
                    <th className="text-left px-4 py-3">
                      <button
                        onClick={() => handleSort("joined_at")}
                        className="font-mono text-xs text-annex-dark-gray uppercase tracking-wider hover:text-white transition-colors cursor-pointer flex items-center"
                      >
                        Joined <SortIcon field="joined_at" />
                      </button>
                    </th>
                    <th className="text-right px-4 py-3">
                      <button
                        onClick={() => handleSort("file_count")}
                        className="font-mono text-xs text-annex-dark-gray uppercase tracking-wider hover:text-white transition-colors cursor-pointer flex items-center ml-auto"
                      >
                        Files <SortIcon field="file_count" />
                      </button>
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center text-sm text-annex-dark-gray"
                      >
                        No members found.
                      </td>
                    </tr>
                  )}
                  {sortedMembers.map((member) => (
                    <tr
                      key={member.user_id}
                      className="border-t border-white/8 hover:bg-white/2 transition-colors animate-rowIn"
                    >
                      <td className="px-4 py-3 font-mono text-white text-sm">
                        {member.email}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-mono px-2 py-0.5 rounded ${
                            member.role === "admin"
                              ? "bg-annex-dark-purple text-annex-light-purple"
                              : "bg-white/6 text-annex-dark-gray"
                          }`}
                        >
                          {member.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-annex-dark-gray text-sm font-mono">
                        {new Date(member.joined_at).toLocaleDateString(
                          "en-US",
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          },
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-white">
                        {member.file_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {member.role !== "admin" && (
                          <button
                            onClick={() => handleRemove(member.user_id)}
                            disabled={removingId === member.user_id}
                            className={`text-xs font-mono transition-colors cursor-pointer disabled:opacity-50 ${
                              removeConfirm === member.user_id
                                ? "text-annex-light-red hover:text-red-400"
                                : "text-annex-dark-gray hover:text-annex-light-red"
                            }`}
                          >
                            {removingId === member.user_id
                              ? "Removing..."
                              : removeConfirm === member.user_id
                                ? "Confirm?"
                                : "Remove"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cancel confirm on outside click */}
            {removeConfirm && (
              <button
                onClick={() => setRemoveConfirm(null)}
                className="text-xs text-annex-dark-gray hover:text-white transition-colors cursor-pointer self-start"
              >
                Cancel remove
              </button>
            )}
          </section>
        )}

        {/* Non-admin view */}
        {!isAdmin && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-mono font-medium text-annex-dark-gray uppercase tracking-wider">
              Members
            </h2>
            <div className="rounded-lg border border-white/8 bg-white/2 p-5">
              <p className="text-sm text-annex-dark-gray">
                {members.length} member{members.length !== 1 ? "s" : ""} in your
                organization.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
