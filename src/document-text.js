// Turning an uploaded document into plain text for the model to read.
//
// This runs in the main process, not the renderer: the parsers are Node
// modules, and a malformed PDF or a zip bomb should fail in a process that can
// contain it rather than inside the window the user is looking at.
//
// The output is deliberately plain. Ember reads it as text and searches it per
// question (see retrieveExcerpts in the renderer), so layout, fonts and cell
// borders are noise - what matters is that the words survive in reading order
// and that nothing silently goes missing.

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";
import { unzipSync } from "fflate";

// Resolved from the installed package rather than assembled from __dirname:
// inside a packaged app this lives under app.asar.unpacked, and guessing the
// layout is how this kind of path breaks only after release.
//
// The separator matters, and not in the way it looks. pdf.js under Node wants a
// path with forward slashes and a trailing slash. Measured against the
// alternatives on Windows: a native backslash path throws "Invalid factory
// url", a file:// URL fails to load the font, and omitting it warns on every
// document. Only this form is clean.
const STANDARD_FONTS_URL = (() => {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require.resolve("pdfjs-dist/package.json");
    return path.join(path.dirname(pkg), "standard_fonts").replace(/\\/g, "/") + "/";
  } catch {
    return undefined;
  }
})();

// Zip-based formats can be made to expand enormously from a small file. These
// caps are the containment: nothing is decompressed past them, so a hostile
// .docx cannot exhaust memory just by being opened.
const MAX_ENTRY_BYTES = 80 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const MAX_PDF_PAGES = 2000;

export const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".rst", ".csv", ".tsv", ".json", ".jsonl",
  ".yaml", ".yml", ".xml", ".log", ".ini", ".cfg", ".conf", ".toml", ".env",
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".rb", ".go", ".rs",
  ".java", ".kt", ".swift", ".c", ".h", ".cpp", ".hpp", ".cc", ".cs", ".php",
  ".sh", ".bash", ".zsh", ".ps1", ".sql", ".html", ".htm", ".css", ".scss",
  ".less", ".vue", ".svelte", ".r", ".m", ".pl", ".lua", ".dart", ".ex",
  ".tex", ".bib", ".srt", ".vtt", ".gitignore", ".dockerfile", ".makefile",
]);

export const DOCUMENT_EXTENSIONS = new Set([
  ".pdf", ".docx", ".xlsx", ".xlsm", ".pptx", ".odt", ".ods", ".odp", ".rtf", ".epub",
]);

export function isSupported(filename) {
  const ext = path.extname(String(filename || "")).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || DOCUMENT_EXTENSIONS.has(ext);
}

// ---------------------------------------------------------------- XML helpers

// Office formats are XML, and what is wanted from them is the text between the
// tags. A real XML parse would be more correct in principle, but these files
// routinely run to tens of megabytes of markup and the structure that matters
// here is only "where does one paragraph end and the next begin".
function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    // last, so a literal "&amp;lt;" does not become "<"
    .replace(/&amp;/g, "&");
}

// Pulls the contents of every <tag>...</tag>, in document order.
function textOfTags(xml, tagPattern) {
  const out = [];
  const re = new RegExp(`<(?:\\w+:)?(?:${tagPattern})\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?(?:${tagPattern})>`, "g");
  let m;
  while ((m = re.exec(xml)) !== null) out.push(decodeEntities(m[1].replace(/<[^>]*>/g, "")));
  return out;
}

function unzipCapped(buf, wanted) {
  let total = 0;
  const files = unzipSync(buf, {
    filter: (file) => {
      if (!wanted(file.name)) return false;
      if (file.originalSize > MAX_ENTRY_BYTES) {
        throw new Error("That file contains an entry too large to open safely.");
      }
      total += file.originalSize;
      if (total > MAX_TOTAL_BYTES) {
        throw new Error("That file expands to more than this reader will open.");
      }
      return true;
    },
  });
  return files;
}

const dec = new TextDecoder("utf-8");

// ---------------------------------------------------------------- PDF

async function readPdf(buf) {
  // the legacy build is the one that runs under Node without a DOM
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    // pdf.js warns and degrades without this. The fonts ship inside the
    // package, so this is a path on disk, not a fetch - and it must keep its
    // trailing slash, which is what pdf.js concatenates filenames onto.
    standardFontDataUrl: STANDARD_FONTS_URL,
    // a document should never be able to make the reader fetch something
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const doc = await task.promise;
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
  const out = [];
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // items carry their own spacing decisions; hasEOL is pdf.js telling us a
    // line ended, which is the only line structure a PDF really has
    let line = "";
    const lines = [];
    for (const item of content.items) {
      if (typeof item.str !== "string") continue;
      line += item.str;
      if (item.hasEOL) { lines.push(line); line = ""; }
    }
    if (line) lines.push(line);
    out.push(`--- page ${i} ---\n${lines.join("\n")}`);
    page.cleanup();
  }
  const totalPages = doc.numPages;
  // destroy() is on the loading task, not the document - calling it on the
  // document throws, which is how the first version of this failed on every
  // single PDF
  await task.destroy();

  const text = out.join("\n\n");
  const truncated = totalPages > pages;
  return {
    text,
    note: `${totalPages} page${totalPages === 1 ? "" : "s"}` +
      (truncated ? `, first ${pages} read` : ""),
    // A scanned PDF is images with no text layer. Saying so is the difference
    // between "Ember cannot see this" and Ember confidently answering from
    // nothing at all.
    empty: !text.replace(/--- page \d+ ---/g, "").trim(),
  };
}

// ---------------------------------------------------------------- DOCX / ODT

async function readDocx(buf) {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.extractRawText({ buffer: buf });
  return {
    text: result.value || "",
    note: "Word document",
    empty: !(result.value || "").trim(),
  };
}

function readOdt(buf) {
  const files = unzipCapped(buf, (n) => n === "content.xml");
  const xml = files["content.xml"] ? dec.decode(files["content.xml"]) : "";
  // text:p is a paragraph, text:h a heading - both are lines
  const parts = textOfTags(xml, "text:p|text:h");
  const text = parts.join("\n");
  return { text, note: "OpenDocument text", empty: !text.trim() };
}

// ---------------------------------------------------------------- XLSX

// A spreadsheet is read as one block of tab-separated rows per sheet. That is
// the shape a language model can actually reason about - it keeps rows and
// columns aligned without pretending to reproduce a grid.
function readXlsx(buf) {
  const files = unzipCapped(buf, (n) =>
    n === "xl/workbook.xml" || n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));

  // Shared strings are stored once and referenced by index; without resolving
  // them a spreadsheet reads as a grid of meaningless numbers.
  let shared = [];
  if (files["xl/sharedStrings.xml"]) {
    const sx = dec.decode(files["xl/sharedStrings.xml"]);
    shared = (sx.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) || []).map((si) =>
      textOfTags(si, "t").join(""));
  }

  let names = [];
  if (files["xl/workbook.xml"]) {
    const wx = dec.decode(files["xl/workbook.xml"]);
    names = [...wx.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) => decodeEntities(m[1]));
  }

  const sheetKeys = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]));

  const blocks = [];
  let cells = 0;
  sheetKeys.forEach((key, idx) => {
    const xml = dec.decode(files[key]);
    const rows = xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) || [];
    const lines = [];
    for (const row of rows) {
      const values = [];
      const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
      let c;
      while ((c = cellRe.exec(row)) !== null) {
        const attrs = c[1] || c[3] || "";
        const body = c[2] || "";
        const type = (attrs.match(/\bt="([^"]*)"/) || [])[1] || "n";
        let v;
        if (type === "s") {
          const i = Number(textOfTags(body, "v")[0]);
          v = Number.isFinite(i) ? (shared[i] ?? "") : "";
        } else if (type === "inlineStr") {
          v = textOfTags(body, "t").join("");
        } else if (type === "str" || type === "e") {
          v = textOfTags(body, "v").join("");
        } else if (type === "b") {
          v = textOfTags(body, "v")[0] === "1" ? "TRUE" : "FALSE";
        } else {
          v = textOfTags(body, "v").join("");
        }
        values.push(v);
        cells++;
      }
      // a row of entirely empty cells carries nothing
      if (values.some((x) => String(x).trim() !== "")) lines.push(values.join("\t"));
    }
    if (lines.length) {
      blocks.push(`--- sheet: ${names[idx] || `sheet${idx + 1}`} ---\n${lines.join("\n")}`);
    }
  });

  const text = blocks.join("\n\n");
  return {
    text,
    note: `${sheetKeys.length} sheet${sheetKeys.length === 1 ? "" : "s"}, ${cells} cells`,
    empty: !text.trim(),
  };
}

function readOds(buf) {
  const files = unzipCapped(buf, (n) => n === "content.xml");
  const xml = files["content.xml"] ? dec.decode(files["content.xml"]) : "";
  const tables = xml.match(/<table:table\b[\s\S]*?<\/table:table>/g) || [];
  const blocks = tables.map((t, i) => {
    const name = (t.match(/table:name="([^"]*)"/) || [])[1] || `sheet${i + 1}`;
    const rows = t.match(/<table:table-row\b[\s\S]*?<\/table:table-row>/g) || [];
    const lines = rows.map((r) => {
      const cellsXml = r.match(/<table:table-cell\b[\s\S]*?<\/table:table-cell>|<table:table-cell\b[^>]*\/>/g) || [];
      const vals = cellsXml.map((c) => textOfTags(c, "text:p").join(" "));
      return vals.some((x) => x.trim()) ? vals.join("\t") : null;
    }).filter(Boolean);
    return lines.length ? `--- sheet: ${decodeEntities(name)} ---\n${lines.join("\n")}` : null;
  }).filter(Boolean);
  const text = blocks.join("\n\n");
  return { text, note: `${tables.length} sheets`, empty: !text.trim() };
}

// ---------------------------------------------------------------- PPTX

function readPptx(buf) {
  const files = unzipCapped(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const keys = Object.keys(files)
    .sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]));
  const blocks = keys.map((k, i) => {
    // a:t holds every run of text on a slide, in order
    const parts = textOfTags(dec.decode(files[k]), "a:t").filter((x) => x.trim());
    return parts.length ? `--- slide ${i + 1} ---\n${parts.join("\n")}` : null;
  }).filter(Boolean);
  const text = blocks.join("\n\n");
  return { text, note: `${keys.length} slide${keys.length === 1 ? "" : "s"}`, empty: !text.trim() };
}

function readOdp(buf) {
  const files = unzipCapped(buf, (n) => n === "content.xml");
  const xml = files["content.xml"] ? dec.decode(files["content.xml"]) : "";
  const pages = xml.match(/<draw:page\b[\s\S]*?<\/draw:page>/g) || [];
  const blocks = pages.map((p, i) => {
    const parts = textOfTags(p, "text:p|text:span").filter((x) => x.trim());
    return parts.length ? `--- slide ${i + 1} ---\n${parts.join("\n")}` : null;
  }).filter(Boolean);
  const text = blocks.join("\n\n");
  return { text, note: `${pages.length} slides`, empty: !text.trim() };
}

// ---------------------------------------------------------------- EPUB / RTF

function readEpub(buf) {
  const files = unzipCapped(buf, (n) => /\.x?html?$/i.test(n));
  const keys = Object.keys(files).sort();
  const parts = keys.map((k) => {
    const html = dec.decode(files[k]);
    const body = (html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i) || [, html])[1];
    return decodeEntities(
      body.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
          .replace(/<\/(p|div|h[1-6]|li|br)>/gi, "\n")
          .replace(/<[^>]*>/g, ""),
    ).replace(/\n{3,}/g, "\n\n").trim();
  }).filter(Boolean);
  const text = parts.join("\n\n");
  return { text, note: `${keys.length} sections`, empty: !text.trim() };
}

// RTF is not XML and not a zip - it is control words and braces. Stripping
// those leaves the prose, which is all that is wanted here.
function readRtf(buf) {
  let s = buf.toString("latin1");
  s = s.replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.replace(/\\u(-?\d+)\??/g, (_, d) => {
    const n = Number(d);
    return String.fromCharCode(n < 0 ? n + 65536 : n);
  });
  // Drop the groups that describe the document rather than say anything. The
  // font table is the one that bites: without this, every RTF starts with
  // "Times New Roman;" glued to the first sentence. These groups nest one
  // level in practice ({\fonttbl {\f0 Times New Roman;}}), which is what the
  // inner alternation accounts for.
  s = s.replace(/\{\\\*[\s\S]*?\}/g, "");
  s = s.replace(
    /\{\\(?:fonttbl|colortbl|stylesheet|listtable|listoverridetable|rsidtbl|info|generator|pict|object|header\w*|footer\w*)\b[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi,
    "",
  );
  s = s.replace(/\\par[d]?\b/g, "\n").replace(/\\line\b/g, "\n").replace(/\\tab\b/g, "\t");
  s = s.replace(/\\[a-z]+-?\d*\s?/gi, "").replace(/[{}]/g, "");
  const text = s.replace(/\n{3,}/g, "\n\n").trim();
  return { text, note: "rich text", empty: !text.trim() };
}

// ---------------------------------------------------------------- entry point

// Returns { ok, text, note, kind } or { ok:false, error }. Never throws for a
// bad document: a file the user chose being unreadable is an ordinary outcome
// that deserves a sentence, not a stack trace.
export async function extractDocumentText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let buf;
  try {
    buf = await fs.promises.readFile(filePath);
  } catch (err) {
    return { ok: false, error: `Could not open that file: ${err.message}` };
  }

  try {
    let result;
    switch (ext) {
      case ".pdf":  result = await readPdf(buf); break;
      case ".docx": result = await readDocx(buf); break;
      case ".xlsx":
      case ".xlsm": result = readXlsx(buf); break;
      case ".pptx": result = readPptx(buf); break;
      case ".odt":  result = readOdt(buf); break;
      case ".ods":  result = readOds(buf); break;
      case ".odp":  result = readOdp(buf); break;
      case ".epub": result = readEpub(buf); break;
      case ".rtf":  result = readRtf(buf); break;
      default:
        return { ok: false, error: `emb3r cannot read ${ext || "that kind of"} files yet.` };
    }

    if (result.empty) {
      return {
        ok: false,
        error: ext === ".pdf"
          ? "That PDF has no text in it — it is probably a scan, which would need character recognition emb3r does not have."
          : "That file opened, but there was no text in it to read.",
      };
    }
    // collapse the runs of blank lines these formats tend to produce
    const text = result.text.replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
    return { ok: true, text, note: result.note, kind: ext.slice(1) };
  } catch (err) {
    return { ok: false, error: `Could not read that ${ext.slice(1)} file: ${err.message || String(err)}` };
  }
}
