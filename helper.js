import fs from "fs-extra";
import path from "path";
import pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = "pdfjs-dist/build/pdf.worker.js";

// --- Internal Helper Functions (from 1A) ---

async function extractOutline(pdfDoc) {
  const outline = await pdfDoc.getOutline();
  if (!outline || outline.length === 0) return null;
  const results = [];
  async function walk(items, level) {
    for (const item of items) {
      let page = null;
      try {
        const dest = Array.isArray(item.dest)
          ? item.dest
          : await pdfDoc.getDestination(item.dest);
        if (dest && dest[0]) {
          const idx = await pdfDoc.getPageIndex(dest[0]);
          page = idx + 1;
        }
      } catch {}
      results.push({
        level: `H${Math.min(level, 3)}`,
        text: item.title.trim(),
        page,
      });
      if (item.items && item.items.length) {
        await walk(item.items, level + 1);
      }
    }
  }
  await walk(outline, 1);
  return results;
}

async function extractByFontMetrics(pdfDoc) {
  const numPages = pdfDoc.numPages;
  const allRuns = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const tc = await page.getTextContent();
    tc.items.forEach((item) => {
      const text = item.str.trim();
      if (!text) return;
      const [a, , , d, , y] = item.transform;
      const size = Math.hypot(a, d);
      allRuns.push({ page: i, text, size, y });
    });
  }
  const sizeCounts = allRuns.reduce((m, r) => {
    m[r.size] = (m[r.size] || 0) + 1;
    return m;
  }, {});
  const headingSizes = Object.keys(sizeCounts)
    .map(Number)
    .sort((a, b) => sizeCounts[b] - sizeCounts[a])
    .slice(0, 3);
  const sizeToLevel = {};
  headingSizes.forEach((s, idx) => {
    sizeToLevel[s] = `H${idx + 1}`;
  });
  const runs = allRuns.map((r) => ({
    level: sizeToLevel[r.size] || "P",
    text: r.text,
    page: r.page,
    y: r.y,
  }));
  runs.sort((a, b) => a.page - b.page || b.y - a.y);
  const merged = [];
  runs.forEach((item) => {
    const prev = merged[merged.length - 1];
    if (prev && prev.level === item.level && prev.page === item.page) {
      prev.text += " " + item.text;
    } else {
      merged.push({ level: item.level, text: item.text, page: item.page });
    }
  });
  return merged;
}

// --- EXPORTED FUNCTION FOR 1B ---
// This is the new main function that extract.js will call.
export async function processFileAndGetRuns(inPath) {
  const fileName = path.basename(inPath);
  const pdfDoc = await pdfjsLib.getDocument(inPath).promise;

  // Attempt built-in outline first
  let contentRuns = await extractOutline(pdfDoc);

  // Fallback to font-metrics method if no outline
  if (!contentRuns) {
    contentRuns = await extractByFontMetrics(pdfDoc);
  }

  // Add the source filename to each run for later reference
  contentRuns.forEach((run) => {
    run.fileName = fileName;
  });

  return contentRuns;
}
