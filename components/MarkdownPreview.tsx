"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

// KaTeX (rehype-katex) renders math as MathML plus styled HTML spans.
// rehype-sanitize's default schema strips the MathML tags and aria-hidden,
// so allow them explicitly (presentational attributes only — no href/src,
// so no XSS vector).
const mathmlTags = [
  "math",
  "semantics",
  "annotation",
  "annotation-xml",
  "mrow",
  "mfrac",
  "msqrt",
  "mroot",
  "msub",
  "msup",
  "msubsup",
  "munder",
  "mover",
  "munderover",
  "mi",
  "mo",
  "mn",
  "mtext",
  "mspace",
  "mphantom",
  "mpadded",
  "mstyle",
  "merror",
  "menclose",
  "mtable",
  "mtr",
  "mtd",
  "mlabeledtr",
  "none",
  "mprescripts",
  "mmultiscripts",
  "ms",
  "mglyph",
  "mfenced",
] as const;

const mathmlAttributeList: string[] = [
  "xmlns",
  "encoding",
  "display",
  "accent",
  "accentunder",
  "stretchy",
  "symmetric",
  "largeop",
  "movablelimits",
  "separator",
  "linethickness",
  "rowspacing",
  "columnspacing",
  "framespacing",
  "notation",
  "mathvariant",
  "displaystyle",
  "alttext",
  "depth",
  "voffset",
  "lspace",
  "rspace",
  "minsize",
  "maxsize",
  "form",
  "fence",
  "close",
  "open",
  "separators",
  "columnalign",
  "rowalign",
  "rowlines",
  "columnlines",
  "rowspan",
  "columnspan",
  "rowSpan",
  "columnSpan",
  "scriptlevel",
  "scriptsizemultiplier",
  "mathsize",
  "mathcolor",
  "mathbackground",
];

const mathmlAttributes: Record<string, string[]> = {};
for (const tag of mathmlTags) {
  mathmlAttributes[tag] = mathmlAttributeList;
}

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      "className",
      "class",
      "align",
      "width",
      "height",
      "style",
      "aria-hidden",
      "ariaHidden",
      "role",
    ],
    ...mathmlAttributes,
    img: [
      ...(defaultSchema.attributes?.["img"] ?? []),
      "src",
      "alt",
      "title",
      "width",
      "height",
    ],
    a: [
      ...(defaultSchema.attributes?.["a"] ?? []),
      "href",
      "title",
      "target",
      "rel",
    ],
    input: ["type", "checked", "disabled"],
    th: ["align"],
    td: ["align"],
    code: ["className", "class"],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "details",
    "summary",
    "sup",
    "sub",
    "del",
    "ins",
    "mark",
    "kbd",
    "small",
    "center",
    "picture",
    "source",
    ...mathmlTags,
  ],
};

export default function MarkdownPreview({
  content,
  className = "",
}: MarkdownPreviewProps) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkFrontmatter]}
        rehypePlugins={[
          rehypeRaw,
          // throwOnError: false renders malformed TeX as red text instead of
          // crashing the whole preview.
          [rehypeKatex, { throwOnError: false }],
          [rehypeSanitize, sanitizeSchema],
          rehypeHighlight,
        ]}
        components={{
          input({ type, checked, ...props }) {
            if (type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="mr-1 align-middle"
                  {...props}
                />
              );
            }
            return <input type={type} {...props} />;
          },
          a({ href, children, ...props }) {
            const isExternal =
              href?.startsWith("http://") || href?.startsWith("https://");
            return (
              <a
                href={href}
                rel={isExternal ? "noopener noreferrer" : undefined}
                target={isExternal ? "_blank" : undefined}
                {...props}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
