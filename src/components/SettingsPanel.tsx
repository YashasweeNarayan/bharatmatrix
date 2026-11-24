"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Mail,
  CalendarDays,
  FileText,
  Bot,
  Loader2,
  Check,
  Upload,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import Avatar from "@/components/Avatar";

export default function SettingsPanel({
  email,
  initialUsername,
  initialAvatarUrl,
  createdAt,
  documentCount,
  telegramLinked,
  canResetWithoutCurrent = false,
}: {
  email: string;
  initialUsername: string | null;
  initialAvatarUrl: string | null;
  createdAt: string;
  documentCount: number;
  telegramLinked: boolean;
  /** True right after a fresh Google sign-in: the old password isn't needed. */
  canResetWithoutCurrent?: boolean;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const joined = new Date(createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <ProfileCard
        email={email}
        initialUsername={initialUsername}
        initialAvatarUrl={initialAvatarUrl}
      />

      <div className="rounded-2xl border border-ink-700 bg-ink-900/40 p-5">
        <h2 className="text-[15px] font-semibold text-neutral-100">Account</h2>
        <dl className="mt-4 flex flex-col gap-3">
          <Row icon={Mail} label="Email" value={email} />
          <Row icon={CalendarDays} label="Member since" value={joined} />
          <Row
            icon={FileText}
            label="Documents uploaded"
            value={String(documentCount)}
          />
          <Row
            icon={Bot}
            label="Telegram"
            value={telegramLinked ? "Connected" : "Not connected"}
          />
        </dl>
      </div>

      <PasswordCard skipCurrent={canResetWithoutCurrent} />

      <div className="rounded-2xl border border-ink-700 bg-ink-900/40 p-5">
        <h2 className="text-[15px] font-semibold text-neutral-100">
          Session
        </h2>
        <p className="mt-1.5 text-[13px] text-neutral-500">
          Sign out of BharatMatrix on this device.
        </p>
        <button
          onClick={logout}
          disabled={loggingOut}
          className="mt-4 flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-2 text-[13px] font-medium text-neutral-300 transition-colors hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
        >
          {loggingOut ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LogOut className="h-3.5 w-3.5" />
          )}
          Sign out
        </button>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-800 pb-3 last:border-0 last:pb-0">
      <dt className="flex items-center gap-2 text-[13px] text-neutral-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="truncate text-[13px] text-neutral-200">{value}</dd>
    </div>
  );
}

/**
 * Username + profile picture. There's no Google sign-in anywhere in this
 * app, so a picture only ever gets set by uploading one here — the
 * initials fallback (handled inside Avatar) is the real default for
 * everyone who doesn't.
 */
function ProfileCard({
  email,
  initialUsername,
  initialAvatarUrl,
}: {
  email: string;
  initialUsername: string | null;
  initialAvatarUrl: string | null;
}) {
  const [username, setUsername] = useState(initialUsername ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function saveUsername() {
    setSavingName(true);
    setNameError(null);
    setNameSaved(false);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setNameError(data?.error ?? "Couldn't save your username.");
      } else {
        setNameSaved(true);
      }
    } catch {
      setNameError("Couldn't reach the server.");
    } finally {
      setSavingName(false);
    }
  }

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/account/avatar", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAvatarError(data?.error ?? "Couldn't upload that image.");
      } else {
        setAvatarUrl(data.avatarUrl);
      }
    } catch {
      setAvatarError("Couldn't reach the server.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function removeAvatar() {
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      await fetch("/api/account/avatar", { method: "DELETE" });
      setAvatarUrl(null);
    } finally {
      setUploadingAvatar(false);
    }
  }

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900/40 p-5">
      <h2 className="text-[15px] font-semibold text-neutral-100">Profile</h2>
      <p className="mt-1 text-[13px] text-neutral-500">
        Shown in the header and sidebar instead of your email.
      </p>

      <div className="mt-4 flex items-center gap-4">
        <Avatar name={username || email} avatarUrl={avatarUrl} size={56} />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-1.5 text-[12.5px] text-neutral-300 transition-colors hover:border-saffron-500 hover:text-saffron-400 disabled:opacity-50"
            >
              {uploadingAvatar ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Upload picture
            </button>
            {avatarUrl && (
              <button
                onClick={removeAvatar}
                disabled={uploadingAvatar}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] text-neutral-500 hover:text-red-400 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="text-[11px] text-neutral-600">
            PNG, JPEG or WEBP, up to 3MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) uploadAvatar(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      {avatarError && (
        <p className="mt-2 text-[12px] text-red-400">{avatarError}</p>
      )}

      <div className="mt-5 flex flex-col gap-1.5 border-t border-ink-800 pt-4">
        <label
          htmlFor="username"
          className="text-[12.5px] font-medium text-neutral-400"
        >
          Username
        </label>
        <div className="flex items-center gap-2">
          <input
            id="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setNameSaved(false);
            }}
            placeholder={email}
            maxLength={40}
            className="flex-1 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2 text-[13px] text-neutral-200 placeholder:text-neutral-600 focus:border-saffron-500"
          />
          <button
            onClick={saveUsername}
            disabled={savingName || username === (initialUsername ?? "")}
            className={clsx(
              "flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-medium transition-colors",
              savingName || username === (initialUsername ?? "")
                ? "cursor-not-allowed bg-ink-800 text-neutral-600"
                : "bg-saffron-500 text-onaccent hover:bg-saffron-400",
            )}
          >
            {savingName ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : nameSaved ? (
              <Check className="h-3.5 w-3.5" />
            ) : null}
            Save
          </button>
        </div>
        <p className="text-[11px] text-neutral-600">
          Leave blank to show your email instead.
        </p>
        {nameError && (
          <p className="text-[12px] text-red-400">{nameError}</p>
        )}
      </div>
    </div>
  );
}

function PasswordCard({ skipCurrent }: { skipCurrent: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit =
    (skipCurrent || currentPassword.length > 0) &&
    newPassword.length >= 10 &&
    newPassword === confirmPassword &&
    !saving;

  async function changePassword() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't change your password.");
      } else {
        setSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900/40 p-5">
      <h2 className="text-[15px] font-semibold text-neutral-100">Password</h2>
      <p className="mt-1 text-[13px] text-neutral-500">
        Change the password you sign in with.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {skipCurrent ? (
          <p className="rounded-lg border border-matrix-500/30 bg-matrix-500/10 px-3 py-2 text-[12.5px] text-matrix-400">
            You just signed in with Google, so you can set a new password
            without the old one.
          </p>
        ) : (
          <Field
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
        )}
        <Field
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          hint="At least 10 characters, with letters and numbers"
        />
        <Field
          label="Confirm new password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          error={mismatch ? "Passwords don't match." : undefined}
        />

        <button
          onClick={changePassword}
          disabled={!canSubmit}
          className={clsx(
            "mt-1 flex items-center justify-center gap-1.5 self-start rounded-lg px-4 py-2 text-[13px] font-medium transition-colors",
            canSubmit
              ? "bg-saffron-500 text-onaccent hover:bg-saffron-400"
              : "cursor-not-allowed bg-ink-800 text-neutral-600",
          )}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : success ? (
            <Check className="h-3.5 w-3.5" />
          ) : null}
          {success ? "Password changed" : "Change password"}
        </button>
        {error && <p className="text-[12px] text-red-400">{error}</p>}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12.5px] font-medium text-neutral-400">
        {label}
      </label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
        className="rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2 text-[13px] text-neutral-200 focus:border-saffron-500"
      />
      {hint && !error && (
        <p className="text-[11px] text-neutral-600">{hint}</p>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
