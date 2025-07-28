For Challenge 1B, our goal is to automatically extract and rank the most relevant document sections for a given “persona” and “job to be done.” We accomplish this in three stages: content extraction, semantic embedding and ranking, and JSON output formatting.

**1. Content Extraction**\
We parse each PDF via PDF.js in Node.js.

- **Outline extraction**: If a PDF has native bookmarks, we recursively traverse them to capture each entry’s text, hierarchy level (H1–H3), and page number.
- **Font‑metrics fallback**: For PDFs without outlines, we extract every text run’s font size and vertical position. We cluster the three most frequent sizes as H1–H3 headings and classify other runs as paragraphs (P). We then sort by page and vertical position and merge consecutive runs of the same level.

This hybrid approach preserves document semantics when available and gracefully degrades otherwise.

**2. Semantic Embedding & Ranking**\
Once we have a unified list of `{ level, text, page }` runs, we compute their relevance to the user context:

```
Persona: <persona.role>. Task: <job_to_be_done.task>
```

We use `@xenova/transformers` with the `all-MiniLM-L6-v2` model:

- Generate a **context embedding** from the persona/task prompt.
- Generate embeddings for each run’s text.
- Compute cosine similarity between each run and the context.
- Sort runs by descending similarity to rank the most relevant first.

This provides semantically meaningful document recommendations.

**3. Output Formatting**\
The final JSON (`challenge1b_output.json`) contains:

1. **metadata**: input filenames, persona, task, timestamp.
2. **extracted_sections**: array of top runs with fields:
   - `document`: source PDF filename
   - `section_title`: heading text or “Content from page X”
   - `importance_rank`: rank (1 = highest)
   - `page_number`
3. **subsection_analysis**: reserved for future deep insights.

By blending structural heuristics with transformer‑based semantics, this pipeline robustly surfaces the most relevant sections for any persona‑driven use case.

---

## 2. Dockerfile

```dockerfile
# Use a glibc‑based Node image so native addons load correctly
FROM node:18-slim

# Create working directory
WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm install --production

# Copy application code
COPY . .

# Default: process input and write to output
CMD ["node", "extract.js"]
```

---

## 3. Execution Instructions

1. **Prepare host folders**

   ```bash
   mkdir -p input/PDF
   mkdir -p output
   # Place: input/challenge1b_input.json and input/PDF/*.pdf
   ```

2. **Build Docker image**

   ```bash
   docker build --platform linux/amd64 -t mysolution1b:latest .
   ```

3. **Run container**

   ```bash
   docker run --rm \
     --platform linux/amd64 \
     -v "$(pwd)/input:/app/input" \
     -v "$(pwd)/output:/app/output" \
     --network none \
     mysolution1b:latest
   ```

4. **Check output**\
   The file `challenge1b_output.json` will appear in `./output` on your host.

---

## 4. Sample Input / Output

**input/challenge1b_input.json**

```json
{
  "persona": { "role": "Sales Executive" },
  "job_to_be_done": {
    "task": "Rapidly identify product specs in long datasheets"
  },
  "documents": [
    { "filename": "datasheetA.pdf" },
    { "filename": "datasheetB.pdf" }
  ]
}
```

_(Place two small PDFs in **`input/PDF/`** for testing.)_

**output/challenge1b_output.json** _(example)_

```json
{
  "metadata": {
    "input_documents": ["datasheetA.pdf", "datasheetB.pdf"],
    "persona": "Sales Executive",
    "job_to_be_done": "Rapidly identify product specs in long datasheets",
    "processing_timestamp": "2025-07-28T17:45:30.123Z"
  },
  "extracted_sections": [
    {
      "document": "datasheetA.pdf",
      "section_title": "Electrical Characteristics and Maximum Ratings",
      "importance_rank": 1,
      "page_number": 3
    },
    {
      "document": "datasheetB.pdf",
      "section_title": "Absolute Maximum Ratings",
      "importance_rank": 2,
      "page_number": 2
    }
    // …more entries…
  ],
  "subsection_analysis": []
}
```
