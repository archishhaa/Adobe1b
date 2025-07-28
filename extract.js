import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { processFileAndGetRuns } from "./helper.js";

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In‑container paths (as mounted by the judges)
const INPUT_DIR = "./input";
const PDF_DIR = path.join(INPUT_DIR, "PDF");
const INPUT_JSON = path.join(INPUT_DIR, "challenge1b_input.json");
const OUTPUT_DIR = "./output";
const OUTPUT_JSON = path.join(OUTPUT_DIR, "challenge1b_output.json");

// AI Model initialization
async function initializeModel() {
  const { pipeline } = await import("@xenova/transformers");
  console.log("Initializing AI Model (will download on first run)...");
  const extractor = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2"
  );
  console.log("Model Initialized.");
  return extractor;
}

// Cosine‑similarity helper
function cosineSimilarity(vecA, vecB) {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Main workflow
async function main() {
  // 1. Load AI model
  const extractor = await initializeModel();

  // 2. Read the input JSON
  await fs.ensureDir(INPUT_DIR);
  const inputData = await fs.readJson(INPUT_JSON);
  const { persona, job_to_be_done, documents } = inputData;
  const contextText = `Persona: ${persona.role}. Task: ${job_to_be_done.task}`;

  // 3. Extract text runs from each PDF
  console.log("Processing PDF documents...");
  let allContentRuns = [];
  for (const doc of documents) {
    const pdfPath = path.join(PDF_DIR, doc.filename);
    console.log(`- Extracting from ${doc.filename}`);
    const runs = await processFileAndGetRuns(pdfPath);
    allContentRuns.push(...runs);
  }
  console.log(`Extracted ${allContentRuns.length} total text chunks.`);

  // 4. Compute embeddings
  console.log("Generating embeddings...");
  const ctxEmbed = (
    await extractor(contextText, { pooling: "mean", normalize: true })
  ).data;

  const contentEmbeddings = await Promise.all(
    allContentRuns.map((run) =>
      extractor(run.text, { pooling: "mean", normalize: true }).then(
        (res) => res.data
      )
    )
  );

  // 5. Score and rank
  console.log("Calculating relevance scores...");
  const ranked = allContentRuns
    .map((run, i) => ({
      ...run,
      relevance: cosineSimilarity(ctxEmbed, contentEmbeddings[i]),
    }))
    .sort((a, b) => b.relevance - a.relevance);

  // 6. Build output JSON
  console.log("Generating final output...");
  const outputJson = {
    metadata: {
      input_documents: documents.map((d) => d.filename),
      persona: persona.role,
      job_to_be_done: job_to_be_done.task,
      processing_timestamp: new Date().toISOString(),
    },
    extracted_sections: ranked.map((run, i) => ({
      document: run.fileName,
      section_title:
        run.level === "P"
          ? `Content from page ${run.page}`
          : run.text.slice(0, 80),
      importance_rank: i + 1,
      page_number: run.page,
    })),
    subsection_analysis: [], // placeholder for future enhancement
  };

  // 7. Write output
  await fs.ensureDir(OUTPUT_DIR);
  await fs.writeJson(OUTPUT_JSON, outputJson, { spaces: 2 });
  console.log(`✅ Success! Output written to ${OUTPUT_JSON}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
