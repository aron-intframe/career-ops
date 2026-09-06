// modes/pipeline.md and modes/auto-pipeline.md must agree on which CV artifact
// a processed offer produces. pipeline.md says it "executes the full
// auto-pipeline", so the CV-output choice belongs to auto-pipeline Step 3,
// which routes on `cv.output_format`. When pipeline.md instead spells out its
// own `auto_pdf_score_threshold` gate and never mentions `cv.output_format`,
// a profile set to `text` still gets HTML/PDF artifacts from the inbox path
// while an identical single-URL run correctly gets markdown only (#3910).
//
// The two files are prose read by an agent, not code, so nothing but this
// check keeps them from drifting again: it pins every value
// config/profile.example.yml declares for `cv.output_format` to the same
// destination mode file in both, and pins the score gate to sit downstream of
// the routing rather than in front of it.

import { readFileSync } from 'fs';
import { join } from 'path';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\npipeline / auto-pipeline cv.output_format parity');

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const profileExample = read('config/profile.example.yml');
const autoPipeline = read('modes/auto-pipeline.md');
const pipeline = read('modes/pipeline.md');

// The example profile is the contract for what the key may hold: the quoted
// values on (and under) the `output_format:` line are the legal ones.
const declaredLine = profileExample
  .split(/\r?\n/)
  .find((line) => /^\s*output_format\s*:/.test(line)) ?? '';
const declaredFormats = [...new Set([...declaredLine.matchAll(/"([a-z]+)"/g)].map((m) => m[1]))];

if (declaredFormats.length >= 3 && ['html', 'latex', 'text'].every((f) => declaredFormats.includes(f))) {
  pass(`config/profile.example.yml declares cv.output_format values: ${declaredFormats.join(', ')}`);
} else {
  fail(`config/profile.example.yml no longer declares html/latex/text for cv.output_format (found: ${declaredFormats.join(', ') || 'none'})`);
}

// Each non-default value routes to its own mode file; anything else is the
// default HTML/PDF route.
const routes = [
  { format: 'latex', mode: 'modes/latex.md' },
  { format: 'text', mode: 'modes/text.md' },
  { format: 'html', mode: 'modes/pdf.md' },
];

// Step 3 of auto-pipeline is the canonical statement of the rule.
const step3 = autoPipeline.split(/^## Step 3\b/m)[1]?.split(/^## /m)[0] ?? '';
const missingInStep3 = routes.filter(({ mode }) => !step3.includes(mode));

if (step3.includes('cv.output_format') && missingInStep3.length === 0) {
  pass('modes/auto-pipeline.md Step 3 routes cv.output_format to latex.md / text.md / pdf.md');
} else {
  fail(`modes/auto-pipeline.md Step 3 is no longer the routing rule (missing: ${
    [step3.includes('cv.output_format') ? null : 'cv.output_format', ...missingInStep3.map((r) => r.mode)]
      .filter(Boolean).join(', ')
  })`);
}

// pipeline.md must defer to that rule instead of restating a PDF-only one.
const missingInPipeline = routes.filter(({ mode }) => !pipeline.includes(mode));

if (pipeline.includes('cv.output_format') && missingInPipeline.length === 0) {
  pass('modes/pipeline.md routes CV output on cv.output_format and names the same three mode files');
} else {
  fail(`modes/pipeline.md ignores cv.output_format when choosing the CV artifact (missing: ${
    [pipeline.includes('cv.output_format') ? null : 'cv.output_format', ...missingInPipeline.map((r) => r.mode)]
      .filter(Boolean).join(', ')
  })`);
}

// Ordering is the part that actually fixes #3910: the score gate may narrow the
// default HTML route, never override a profile that asked for text or latex.
const formatAt = pipeline.indexOf('cv.output_format');
const gateAt = pipeline.indexOf('auto_pdf_score_threshold');

if (formatAt !== -1 && gateAt !== -1 && formatAt < gateAt) {
  pass('modes/pipeline.md resolves cv.output_format before applying auto_pdf_score_threshold');
} else if (gateAt === -1) {
  fail('modes/pipeline.md no longer documents auto_pdf_score_threshold — the configurable PDF gate lost its home');
} else {
  fail('modes/pipeline.md applies the auto_pdf_score_threshold gate before resolving cv.output_format, so a `text` profile can still be forced into a PDF');
}
