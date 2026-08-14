# FancyMDPrinter
[![CI / Test and Build](https://github.com/LoliLin/FancyMDPrinter/actions/workflows/ci-test-build.yml/badge.svg)](https://github.com/LoliLin/FancyMDPrinter/actions/workflows/ci-test-build.yml)

**Multi-Tab GitHub-Flavored Markdown (GFM) Live Previewer & PDF/PNG Exporter — 100% static, deployed on GitHub Pages.**

Upload a local folder of `.md` files or import a markdown file from a URL, preview it instantly with 1:1 GitHub visual parity — then export any tab to a PDF or page-sliced PNGs. Everything runs in your browser; there is no backend.

## Live Demo

<https://lolin.github.io/FancyMDPrinter/>

## Features

- **Folder Upload** — drag-and-drop or browse to upload any folder; all `.md` files are opened as tabs
- **URL Import** — paste a raw markdown URL (e.g. `raw.githubusercontent.com/…`) to fetch and open it as a tab; available on the upload screen and in the tab bar "+" menu
- **Multi-Tab SPA** — navigate between files with a browser-style tab bar; close individual tabs
- **GitHub-Style Rendering** — full GFM support via `react-markdown` + `remark-gfm`:
  - Tables, task-list checkboxes, strikethrough, autolinks
  - Fenced code blocks with syntax highlighting (`highlight.js`)
  - **LaTeX math** via KaTeX: inline `$x^2$` and display `$$…$$` blocks
  - Jekyll/front-matter stripping (`remark-frontmatter`)
  - Raw HTML passthrough (e.g. badges, `<details>`, custom fonts)
  - Sanitised with `rehype-sanitize` to prevent XSS
- **shields.io badges** render correctly via HTML passthrough
- **Export to PDF** — browser-native: a print dialog produces the PDF with the exact preview styling (same engine the old server-side exporter used)
- **Export PNG Pages** — client-side A4 page slicing via `html-to-image`, packed into a ZIP with `jszip`
- **Batch Processing** — select multiple tabs and export all PDFs/PNG page sets in one go
- **Privacy** — files are read directly in the browser and never leave your device; no upload, no server, no storage

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | [Next.js 16](https://nextjs.org/) static export (`output: "export"`), App Router, TypeScript |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) + GitHub Primer-inspired markdown CSS |
| Markdown | `react-markdown`, `remark-gfm`, `remark-math`, `remark-frontmatter`, `rehype-raw`, `rehype-sanitize`, `rehype-highlight` |
| Math | KaTeX (`rehype-katex`) |
| PDF Export | Browser print engine (`window.print()` + `@media print` CSS) |
| PNG Export | `html-to-image` + `jszip` |
| Hosting | GitHub Pages (static, no server) |

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production build (static export)

```bash
npm run build   # emits the fully static site into ./out
npm start       # preview ./out locally (uses npx serve)
```

Upload `./out` to any static host (GitHub Pages, Netlify, Vercel static, Nginx, …).

## Deploying to GitHub Pages

1. In the repo settings, enable **Settings → Pages → Build and deployment → Source → GitHub Actions** (the workflow deploys itself; no `gh-pages` branch needed).
2. Push to `main` (or run the **Deploy to GitHub Pages** workflow manually from the Actions tab).

The `.github/workflows/deploy-pages.yml` workflow builds the static export and deploys it via the official Pages actions. `actions/configure-pages` sets `PAGES_BASE_PATH` (e.g. `/FancyMDPrinter` for a project site), which `next.config.ts` turns into Next's `basePath`/`assetPrefix`, so asset URLs and the `next/link` home link work correctly under the sub-path.

## How export works (no server)

- **PDF**: the app calls `window.print()` with a `body.printing` class; the `@media print` CSS hides the app chrome and prints only the rendered markdown (A4, light theme). Choose **Save as PDF** in the print dialog — the suggested filename is the tab name.
- **PNG pages**: the rendered markdown is cloned into an off-screen A4 viewport, rasterised one PNG per A4 page with `html-to-image` (2× pixel ratio), and downloaded as `<name>_png_pages.zip`.

## Known limitations

- PDF export requires the browser print dialog (no automatic download).
- PNG page capture rasterises the current theme (dark mode exports dark pages).
- Images in markdown must be CORS-readable for PNG capture (GitHub raw, shields.io, etc. work); otherwise the capture reports an error for that export.
- URL import needs the remote host to send CORS headers (raw.githubusercontent.com and most raw/gist hosts do) and must point at the raw file, not a rendered HTML page.

## FAQs

Q: Is there any server-side API left?
A: No. The previous `/api/*` routes (upload, session storage, puppeteer PDF/PNG, cron cleanup) were removed in v3 — GitHub Pages cannot run them. All features are implemented client-side.

Q: Is this AI written code?
A: Partially yes, Copilot AI implemented the base code (see PR #1), further functions and extension functions are human written.

<p align="center">
  <img src="https://count.getloli.com/@mereader" alt="mereader counter" />
</p>
