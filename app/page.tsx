"use client";

import Link from "next/link";
import { useState, useCallback, useRef, useEffect } from "react";
import { toPng } from "html-to-image";
import JSZip from "jszip";
import UploadZone from "@/components/UploadZone";
import UrlImportForm from "@/components/UrlImportForm";
import TabBar from "@/components/TabBar";
import MarkdownPreview from "@/components/MarkdownPreview";
import { deriveExportTitle } from "@/lib/exportTitle";

interface MarkdownTab {
  id: string;
  name: string;
  content: string;
}

const EXIT_CONFIRM_MESSAGE = "Exit? You will lose all unsaved changes.";

// A4 at 96 CSS px per inch — matches the previous server-side export layout.
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

function makeUniqueName(baseName: string, existingNames: Set<string>): string {
  if (!existingNames.has(baseName)) {
    return baseName;
  }

  const lastSlash = Math.max(baseName.lastIndexOf("/"), baseName.lastIndexOf("\\"));
  const dirPrefix = lastSlash >= 0 ? baseName.slice(0, lastSlash + 1) : "";
  const fileName = lastSlash >= 0 ? baseName.slice(lastSlash + 1) : baseName;
  const extIndex = fileName.lastIndexOf(".");
  const stem = extIndex > 0 ? fileName.slice(0, extIndex) : fileName;
  const extension = extIndex > 0 ? fileName.slice(extIndex) : "";

  for (let count = 2; ; count++) {
    const candidate = dirPrefix + stem + " (" + count + ")" + extension;
    if (!existingNames.has(candidate)) {
      return candidate;
    }
  }
}

// Turn a markdown URL into a tab name: last path segment, ".md" appended when
// missing, or the hostname when the path has no file name.
function deriveNameFromUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const last = decodeURIComponent(url.pathname)
      .split("/")
      .filter(Boolean)
      .pop();
    if (last) {
      return /\.md$/i.test(last) ? last : `${last}.md`;
    }
    return `${url.hostname.replace(/^www\./, "")}.md`;
  } catch {
    const last = rawUrl.split(/[?#]/)[0].split("/").pop() ?? "";
    if (!last) return "imported.md";
    return /\.md$/i.test(last) ? last : `${last}.md`;
  }
}


export default function Home() {
  const [tabs, setTabs] = useState<MarkdownTab[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [batchSidebarOpen, setBatchSidebarOpen] = useState(false);
  const [batchSidebarWidth, setBatchSidebarWidth] = useState(288);
  const [resizingBatchSidebar, setResizingBatchSidebar] = useState(false);
  const [batchSelection, setBatchSelection] = useState<Set<string>>(new Set());
  const [exportAction, setExportAction] = useState<
    "idle" | "pdf" | "png" | "batch-pdf" | "batch-png"
  >("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const hasOpenTabsRef = useRef(false);
  const batchResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const addFolderInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  // Sync dark mode state with system preference and apply class to <html>
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    // Read current preference; the inline script may have already set the class
    const prefersDark = document.documentElement.classList.contains("dark") || mq.matches;
    setIsDark(prefersDark);

    const handler = (e: MediaQueryListEvent) => {
      // Only follow system if not manually overridden
      if (!document.documentElement.dataset.themeOverride) {
        setIsDark(e.matches);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("light", !isDark);
  }, [isDark]);

  const toggleDark = () => {
    setIsDark((prev) => {
      // Mark as manually overridden so system changes don't override it
      document.documentElement.dataset.themeOverride = "true";
      return !prev;
    });
  };

  // Auto-select the first tab whenever tabs exist but nothing is active.
  // This handles both initial load and edge cases where activeId becomes stale.
  useEffect(() => {
    if (!activeId && tabs.length > 0) {
      setActiveId(tabs[0].id);
    }
  }, [tabs, activeId]);

  useEffect(() => {
    hasOpenTabsRef.current = tabs.length > 0;
  }, [tabs.length]);

    useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasOpenTabsRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = EXIT_CONFIRM_MESSAGE;
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (
        !hasOpenTabsRef.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      if (anchor.target && anchor.target !== "_self") {
        return;
      }

      if (anchor.hasAttribute("download")) {
        return;
      }

      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#")) {
        return;
      }

      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      const sameDocument =
        destination.origin === current.origin &&
        destination.pathname === current.pathname &&
        destination.search === current.search;

      if (!window.confirm(EXIT_CONFIRM_MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // Once confirmed, remove the listener to prevent double prompts on page unload.
      window.removeEventListener("beforeunload", handleBeforeUnload);

      if (sameDocument) {
        // For same-page navigation, we must prevent the default link behavior
        // and manually navigate to ensure our listener removal takes effect
        // before the page unloads.
        event.preventDefault();
        window.location.assign(destination.href);
      }
      // For other links (internal client-side or external), we've removed the listener
      // and can now let the default behavior proceed without causing a double prompt.
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, []);

  const handleFilesLoaded = useCallback(
    (files: { name: string; content: string }[]) => {
      setTabs((prev) => {
        const next = [...prev];
        const existingNames = new Set(prev.map((t) => t.name));

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const uniqueName = makeUniqueName(file.name, existingNames);
          existingNames.add(uniqueName);
          const tabId = `${Date.now()}-${Math.random()}-${i}`;

          next.push({
            id: tabId,
            name: uniqueName,
            content: file.content,
          });
        }

        return next;
      });
    },
    []
  );

  const handleAddFiles = useCallback(async (fileList: FileList) => {
    const mdFiles: { name: string; content: string }[] = [];

    for (const file of Array.from(fileList)) {
      const rel: string =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
        file.name;

      if (!rel.toLowerCase().endsWith(".md")) continue;

      const content = await file.text();
      mdFiles.push({ name: rel, content });
    }

    if (mdFiles.length > 0) {
      handleFilesLoaded(mdFiles);
    }
  }, [handleFilesLoaded]);

  const handleImportFromUrl = useCallback(
    async (url: string) => {
      const trimmed = url.trim();
      if (!trimmed) return;

      let res: Response;
      try {
        res = await fetch(trimmed, { cache: "no-store" });
      } catch {
        throw new Error(
          "Could not reach the URL (network error or blocked by CORS). " +
            "raw.githubusercontent.com and most raw/gist hosts work."
        );
      }

      if (!res.ok) {
        throw new Error(`Failed to fetch URL: HTTP ${res.status}`);
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/html")) {
        throw new Error(
          "URL returned HTML, not a markdown file — use a raw file URL " +
            "(e.g. raw.githubusercontent.com/…)."
        );
      }

      const content = await res.text();
      handleFilesLoaded([{ name: deriveNameFromUrl(trimmed), content }]);
    },
    [handleFilesLoaded]
  );

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        const next = prev.filter((t) => t.id !== id);
        if (activeId === id && next.length > 0) {
          setActiveId(next[Math.max(0, idx - 1)].id);
        } else if (next.length === 0) {
          setActiveId("");
        }
        return next;
      });
    },
    [activeId]
  );

  const closeTabs = useCallback((ids: string[]) => {
    if (ids.length === 0) return;

    const closeSet = new Set(ids);
    setTabs((prev) => {
      const next = prev.filter((t) => !closeSet.has(t.id));

      if (next.length === 0) {
        setActiveId("");
      } else if (closeSet.has(activeId) || !next.some((t) => t.id === activeId)) {
        setActiveId(next[0].id);
      }

      return next;
    });

    setBatchSelection((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, [activeId]);

  const activeTab = tabs.find((t) => t.id === activeId);
  const markdownTabs = tabs.filter((t) => t.name.toLowerCase().endsWith(".md"));
  const selectedMarkdownTabs = markdownTabs.filter((t) => batchSelection.has(t.id));

  // Keep batch selection valid as tabs are opened/closed.
  useEffect(() => {
    const validIds = new Set(tabs.map((t) => t.id));
    setBatchSelection((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [tabs]);

  const toggleBatchTabSelection = useCallback((id: string) => {
    setBatchSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAllMarkdownTabs = useCallback(() => {
    setBatchSelection(new Set(markdownTabs.map((t) => t.id)));
  }, [markdownTabs]);

  const clearBatchSelection = useCallback(() => {
    setBatchSelection(new Set());
  }, []);

  const waitForPreviewPaint = useCallback(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }, []);

  const exportTabToPdf = useCallback(async (tab: MarkdownTab) => {
    const markdownNode = previewRef.current?.querySelector(".markdown-body");
    if (!(markdownNode instanceof HTMLElement)) {
      throw new Error("Unable to export: markdown preview not found");
    }

    // Static (GitHub Pages) export: the PDF is produced by the browser's own
    // print engine — the same engine the old server-side puppeteer used. The
    // "printing" body class plus @media print CSS hides the app chrome and
    // shows only the rendered markdown; the document title becomes the
    // suggested filename in the "Save as PDF" dialog.
    const originalTitle = document.title;
    const wasDark = document.documentElement.classList.contains("dark");

    document.title = deriveExportTitle(tab.name) || "FancyMDPrinter";
    if (wasDark) document.documentElement.classList.remove("dark");
    document.body.classList.add("printing");

    let fallback = 0;
    const restore = () => {
      window.clearTimeout(fallback);
      document.body.classList.remove("printing");
      if (wasDark) document.documentElement.classList.add("dark");
      document.title = originalTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    fallback = window.setTimeout(restore, 120_000);

    try {
      await document.fonts.ready;
      // Let fonts/layout settle before the print dialog snapshots the page.
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 100);
      await promise;
      window.print();
      // Browsers that block until the print dialog closes fire afterprint
      // after print() returns; restore here too so non-blocking/no-op print
      // implementations (e.g. headless) don't leave the page hidden.
      restore();
    } catch (err) {
      restore();
      throw new Error(`PDF export failed: ${String(err)}`);
    }
  }, []);

  const handleExportPdf = async () => {
    if (!activeTab || !previewRef.current) return;
    setExportAction("pdf");
    setExportError(null);
    try {
      await exportTabToPdf(activeTab);
    } catch (err) {
      setExportError(String(err));
    } finally {
      setExportAction("idle");
    }
  };

  const exportTabToPngPages = useCallback(
    async (tab: MarkdownTab) => {
      const markdownNode = previewRef.current?.querySelector(".markdown-body");
      if (!(markdownNode instanceof HTMLElement)) {
        throw new Error("Unable to export: markdown preview not found");
      }

      // Client-side page-sliced PNG export: clone the rendered markdown into
      // an off-screen A4 viewport (so global styles still apply), rasterise
      // one PNG per A4 page with html-to-image, and pack them into a ZIP.
      const base =
        tab.name.replace(/^.*[\\/]/, "").replace(/\.md$/i, "") || "export";
      const zip = new JSZip();

      const content = markdownNode.cloneNode(true) as HTMLElement;
      const host = document.createElement("div");
      host.style.cssText =
        `position:fixed;top:0;left:-10000px;width:${A4_WIDTH_PX}px;` +
        `height:${A4_HEIGHT_PX}px;overflow:hidden;z-index:-1;`;
      const sheet = document.createElement("div");
      sheet.style.cssText = `width:${A4_WIDTH_PX}px;`;
      sheet.appendChild(content);
      host.appendChild(sheet);
      document.body.appendChild(host);

      try {
        // Wait for images and fonts so scrollHeight and capture are accurate.
        await Promise.all(
          Array.from(content.querySelectorAll("img")).map((img) =>
            img.decode().catch(() => {})
          )
        );
        await document.fonts.ready;

        sheet.style.height = `${content.scrollHeight}px`;
        const pageCount = Math.max(
          1,
          Math.ceil(content.scrollHeight / A4_HEIGHT_PX)
        );

        for (let page = 0; page < pageCount; page++) {
          sheet.style.transform = `translateY(${-page * A4_HEIGHT_PX}px)`;
          let dataUrl: string;
          try {
            dataUrl = await toPng(host, {
              width: A4_WIDTH_PX,
              height: A4_HEIGHT_PX,
              pixelRatio: 2,
              cacheBust: true,
              backgroundColor: isDark ? "#0d1117" : "#ffffff",
            });
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            throw new Error(
              `PNG export failed (${reason}). Cross-origin images can block canvas capture; remove them from the markdown to export.`
            );
          }
          const blob = await (await fetch(dataUrl)).blob();
          zip.file(`${base}_page_${page + 1}.png`, blob);
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${base}_png_pages.zip`;
        a.click();
        URL.revokeObjectURL(url);
      } finally {
        host.remove();
      }
    },
    [isDark]
  );

  const handleExportPngPages = async () => {
    if (!activeTab || !previewRef.current) return;
    setExportAction("png");
    setExportError(null);
    try {
      await exportTabToPngPages(activeTab);
    } catch (err) {
      setExportError(String(err));
    } finally {
      setExportAction("idle");
    }
  };

  const handleBatchExportPdf = useCallback(async () => {
    if (selectedMarkdownTabs.length === 0) return;

    setExportAction("batch-pdf");
    setExportError(null);

    const prevActiveId = activeId;

    try {
      for (const tab of selectedMarkdownTabs) {
        setActiveId(tab.id);
        await waitForPreviewPaint();
        await exportTabToPdf(tab);
      }
    } catch (err) {
      setExportError(String(err));
    } finally {
      if (prevActiveId) {
        setActiveId(prevActiveId);
      }
      setExportAction("idle");
    }
  }, [activeId, exportTabToPdf, selectedMarkdownTabs, waitForPreviewPaint]);

  const handleBatchExportPngPages = useCallback(async () => {
    if (selectedMarkdownTabs.length === 0) return;

    setExportAction("batch-png");
    setExportError(null);

    const prevActiveId = activeId;

    try {
      for (const tab of selectedMarkdownTabs) {
        setActiveId(tab.id);
        await waitForPreviewPaint();
        await exportTabToPngPages(tab);
      }
    } catch (err) {
      setExportError(String(err));
    } finally {
      if (prevActiveId) {
        setActiveId(prevActiveId);
      }
      setExportAction("idle");
    }
  }, [activeId, exportTabToPngPages, selectedMarkdownTabs, waitForPreviewPaint]);

  const handleBatchClose = useCallback(() => {
    closeTabs(selectedMarkdownTabs.map((t) => t.id));
  }, [closeTabs, selectedMarkdownTabs]);

  const startBatchSidebarResize = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      batchResizeStateRef.current = {
        startX: e.clientX,
        startWidth: batchSidebarWidth,
      };
      setResizingBatchSidebar(true);
    },
    [batchSidebarWidth]
  );

  useEffect(() => {
    if (!resizingBatchSidebar) return;

    const onMouseMove = (e: MouseEvent) => {
      const dragState = batchResizeStateRef.current;
      if (!dragState) return;

      const delta = e.clientX - dragState.startX;
      const raw = dragState.startWidth + delta;
      const minWidth = 220;
      const maxWidth = Math.max(260, Math.min(640, window.innerWidth - 320));
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, raw));
      setBatchSidebarWidth(nextWidth);
    };

    const onMouseUp = () => {
      setResizingBatchSidebar(false);
      batchResizeStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizingBatchSidebar]);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900">
      <input
        ref={addFolderInputRef}
        type="file"
        // @ts-expect-error - webkitdirectory is non-standard HTML attribute
        webkitdirectory=""
        directory=""
        multiple
        accept=".md"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleAddFiles(e.target.files);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={addFileInputRef}
        type="file"
        accept=".md"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleAddFiles(e.target.files);
          e.currentTarget.value = "";
        }}
      />

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-800">
        <Link
          href="/"
          aria-label="Go to main page"
          className="flex items-center gap-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-800"
        >
          <svg
            className="w-6 h-6"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="fmd-brand"
                x1="0"
                y1="0"
                x2="24"
                y2="24"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0" stopColor="#4f8cff" />
                <stop offset="1" stopColor="#7c5cff" />
              </linearGradient>
            </defs>
            <rect
              x="1"
              y="1"
              width="22"
              height="22"
              rx="6.5"
              fill="url(#fmd-brand)"
            />
            <path
              d="M8 5.5h6l3 3V17a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z"
              fill="#fff"
            />
            <path
              d="M14 5.5v3h3"
              fill="none"
              stroke="#4f8cff"
              strokeWidth="1.3"
            />
            <path
              d="M12 12.6v4.4m0 0l-1.7-1.7m1.7 1.7l1.7-1.7"
              fill="none"
              stroke="#4f8cff"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-white font-semibold text-lg">
            FancyMDPrinter
          </span>
          <span className="text-gray-400 text-sm hidden sm:inline">
            GFM Live Previewer &amp; PDF/PNG Exporter
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {/* Dark mode toggle – always visible */}
          <button
            onClick={toggleDark}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="flex items-center justify-center w-8 h-8 text-gray-300 hover:text-white rounded transition-colors"
          >
            {isDark ? (
              /* Sun icon – click to go light */
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"
                />
              </svg>
            ) : (
              /* Moon icon – click to go dark */
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"
                />
              </svg>
            )}
          </button>

          {tabs.length > 0 && (
            <>
              <button
                onClick={handleExportPdf}
                disabled={!activeTab || exportAction !== "idle"}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded transition-colors"
              >
                {exportAction === "pdf" ? (
                  <>
                    <svg
                      className="w-4 h-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8H4z"
                      />
                    </svg>
                    Exporting PDF...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                      />
                    </svg>
                    Export PDF
                  </>
                )}
              </button>
              <button
                onClick={handleExportPngPages}
                disabled={!activeTab || exportAction !== "idle"}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded transition-colors"
              >
                {exportAction === "png" ? "Exporting PNG..." : "Export PNG Pages"}
              </button>
              <button
                onClick={() => {
                  setTabs([]);
                  setActiveId("");
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
              >
                Close All
              </button>
            </>
          )}
        </div>
      </header>

      {exportError && (
        <div className="px-4 py-2 text-sm bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-b border-red-200 dark:border-red-800 flex items-center justify-between">
          <span>⚠ {exportError}</span>
          <button
            onClick={() => setExportError(null)}
            className="ml-4 text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      {tabs.length === 0 ? (
        /* Upload screen */
        <main className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="w-full max-w-xl">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 text-center">
              FancyMDPrinter
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-center mb-8">
              Upload a folder of{" "}
              <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">
                .md
              </code>{" "}
              files or a single{" "}
              <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">
                .md
              </code>{" "}
              file to preview with GitHub-style rendering.
            </p>
            <UploadZone onFilesLoaded={handleFilesLoaded} />
            <div className="mt-6 flex items-center gap-3 text-xs text-gray-400">
              <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
              or import from URL
              <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            </div>
            <div className="mt-3">
              <UrlImportForm onImport={handleImportFromUrl} />
            </div>
            <p className="text-xs text-gray-400 text-center mt-4">
              Everything runs locally in your browser — files never leave your
              device. PDF and PNG export need no server.
            </p>
          </div>
        </main>
      ) : (
        /* Tab + preview screen */
        <div className="flex flex-1 overflow-hidden">

          {batchSidebarOpen && (
            <aside
              className="relative shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 overflow-y-auto"
              style={{ width: `${batchSidebarWidth}px` }}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Batch Process
                </p>
                <button
                  type="button"
                  aria-label="Collapse batch sidebar"
                  onClick={() => setBatchSidebarOpen(false)}
                  className="rounded px-2 py-1 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Hide
                </button>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Open Markdown Files
                  </p>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {selectedMarkdownTabs.length}/{markdownTabs.length} selected
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <button
                    type="button"
                    onClick={selectAllMarkdownTabs}
                    disabled={markdownTabs.length === 0}
                    className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-100 disabled:opacity-50"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={clearBatchSelection}
                    disabled={selectedMarkdownTabs.length === 0}
                    className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-100 disabled:opacity-50"
                  >
                    Clear
                  </button>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                  {markdownTabs.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No .md files are currently open.
                    </p>
                  ) : (
                    markdownTabs.map((tab) => {
                      const shortName = tab.name.split(/[\\/]/).pop() ?? tab.name;
                      return (
                        <label
                          key={tab.id}
                          className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                          title={tab.name}
                        >
                          <input
                            type="checkbox"
                            checked={batchSelection.has(tab.id)}
                            onChange={() => toggleBatchTabSelection(tab.id)}
                          />
                          <span className="truncate">{shortName}</span>
                        </label>
                      );
                    })
                  )}
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleBatchExportPdf}
                    disabled={selectedMarkdownTabs.length === 0 || exportAction !== "idle"}
                    className="w-full px-3 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-400"
                  >
                    {exportAction === "batch-pdf" ? "Exporting PDFs..." : "Export Selected PDFs"}
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchExportPngPages}
                    disabled={selectedMarkdownTabs.length === 0 || exportAction !== "idle"}
                    className="w-full px-3 py-2 text-sm rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-emerald-400"
                  >
                    {exportAction === "batch-png" ? "Exporting PNGs..." : "Export Selected PNG Pages"}
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchClose}
                    disabled={selectedMarkdownTabs.length === 0 || exportAction !== "idle"}
                    className="w-full px-3 py-2 text-sm rounded bg-gray-600 hover:bg-gray-500 text-white disabled:bg-gray-400"
                  >
                    Close Selected
                  </button>
                </div>
              </div>

              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize batch sidebar"
                onMouseDown={startBatchSidebarResize}
                className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-blue-400/60"
              />
            </aside>
          )}

          <div className="flex flex-col flex-1 overflow-hidden">
            <TabBar
              tabs={tabs}
              activeId={activeId}
              batchSidebarOpen={batchSidebarOpen}
              onSelect={setActiveId}
              onClose={closeTab}
              onToggleBatchSidebar={() => setBatchSidebarOpen((prev) => !prev)}
              onAddFolder={() => addFolderInputRef.current?.click()}
              onAddFile={() => addFileInputRef.current?.click()}
              onImportUrl={handleImportFromUrl}
            />
            <div className="flex-1 overflow-y-auto">
              <div
                ref={previewRef}
                className="max-w-4xl mx-auto px-6 py-8"
              >
                {activeTab ? (
                  <MarkdownPreview
                    key={activeTab.id}
                    content={activeTab.content}
                  />
                ) : (
                  <p className="text-gray-400 text-center mt-16">
                    Select a tab to preview
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
