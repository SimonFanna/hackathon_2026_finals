// T2 · Scale benchmark: score 2.5M customers × 5 life moments with the real predict() and weights.json.
//   npx --yes tsx@4.19.2 scripts/ml/benchmark.ts [customers]
// Feature vectors are resampled from the 2,000 real synthetic customers (scripts/ml/out/features.csv),
// so the sparsity is realistic. Signals and features are computed incrementally upstream (only customers
// with new events), so scoring is the part that runs over the whole base.
import { readFileSync } from "node:fs";
import { predict, score } from "../../web/src/backend/engine/model";
import type { ModelWeight, MomentCode } from "../../web/src/backend/types";

const N = Number(process.argv[2] ?? 2_500_000);
const MOMENTS: MomentCode[] = ["HOME_BUYING", "STARTING_BUSINESS", "NEW_PARENT", "EV_PURCHASE", "RETIREMENT_PREP"];
const weights: ModelWeight[] = JSON.parse(readFileSync(new URL("../../web/src/backend/engine/weights.json", import.meta.url), "utf8"));

const [header, ...lines] = readFileSync(new URL("./out/features.csv", import.meta.url), "utf8").trim().split("\n");
const names = header.split(",").slice(1);
const pool = lines.map((l) => {
  const v = l.split(",").slice(1).map(Number);
  return Object.fromEntries(names.map((n, i) => [n, v[i]]).filter(([, x]) => x !== 0));   // sparse, like real customers
});

for (const m of MOMENTS) predict(m, pool[0], weights);    // compile + warm up
const calls = N * MOMENTS.length;

// 1. Batch scoring of the whole base: confidence only (score()).
let flagged = 0;
let t0 = performance.now();
for (let i = 0; i < N; i++) {
  const x = pool[i % pool.length];
  for (const m of MOMENTS) if (score(m, x, weights)! >= 0.5) flagged++;
}
const batch = (performance.now() - t0) / 1000;
console.log(`batch  score():   ${N.toLocaleString("en")} customers × ${MOMENTS.length} moments = ${calls.toLocaleString("en")} scores in ${batch.toFixed(2)} s ` +
  `(${((batch / calls) * 1e6).toFixed(2)} µs each, one CPU core). ${(flagged / calls * 100).toFixed(1)}% of scores ≥ 0.5.`);

// 2. The same model on dense feature vectors (how a nightly batch would store features): a dot product.
const W = MOMENTS.map((m) => {
  const row = new Float64Array(names.length);
  for (const w of weights) if (w.moment === m && w.feature !== "__bias__") row[names.indexOf(w.feature)] = w.weight;
  return row;
});
const B = MOMENTS.map((m) => weights.find((w) => w.moment === m && w.feature === "__bias__")!.weight);
const dense = lines.map((l) => Float64Array.from(l.split(",").slice(1).map(Number)));
let flaggedDense = 0;
t0 = performance.now();
for (let i = 0; i < N; i++) {
  const x = dense[i % dense.length];
  for (let m = 0; m < W.length; m++) {
    const w = W[m];
    let z = B[m];
    for (let j = 0; j < x.length; j++) z += w[j] * x[j];
    if (z >= 0) flaggedDense++;                                  // sigmoid(z) ≥ 0.5  ⇔  z ≥ 0
  }
}
const vec = (performance.now() - t0) / 1000;
console.log(`dense  vectors:   ${calls.toLocaleString("en")} scores in ${vec.toFixed(2)} s (${((vec / calls) * 1e9).toFixed(0)} ns each, one CPU core). ` +
  `Same decisions: ${flaggedDense === flagged ? "yes" : `no (${flaggedDense} vs ${flagged})`}.`);

// 3. Explained predictions (with the top-5 "why"), only needed for the customers Kate talks to.
const sample = Math.min(N, 200_000);
t0 = performance.now();
for (let i = 0; i < sample; i++) for (const m of MOMENTS) predict(m, pool[i % pool.length], weights);
const explained = (performance.now() - t0) / 1000;
console.log(`explained predict(): ${((explained / (sample * MOMENTS.length)) * 1e6).toFixed(2)} µs each (with contributions).`);
