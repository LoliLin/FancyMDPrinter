"use client";

import { useState, type FormEvent } from "react";

interface UrlImportFormProps {
  onImport: (url: string) => Promise<void>;
  onSuccess?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
}

export default function UrlImportForm({
  onImport,
  onSuccess,
  autoFocus = false,
  compact = false,
}: UrlImportFormProps) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);
    try {
      await onImport(trimmed);
      setUrl("");
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={
        compact
          ? "flex flex-col gap-2"
          : "flex flex-col gap-2 sm:flex-row"
      }
    >
      <input
        type="text"
        value={url}
        autoFocus={autoFocus}
        onChange={(e) => {
          setUrl(e.target.value);
          setError(null);
        }}
        placeholder="https://…/file.md (raw URL)"
        spellCheck={false}
        className="flex-1 min-w-0 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      <button
        type="submit"
        disabled={busy || url.trim().length === 0}
        className="rounded bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 px-4 py-2 text-sm text-white whitespace-nowrap transition-colors"
      >
        {busy ? "Importing…" : "Import"}
      </button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 break-words">
          {error}
        </p>
      )}
    </form>
  );
}
