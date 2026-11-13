// Loads the S-Pankki CSVs into the linked Supabase project through the Supabase CLI
// (`supabase db query --remote`), as batched INSERT statements.
// Usage: npm run load-data [-- /path/to/Junction-2026-S-pankki]
// Needs `npx supabase login` + `npx supabase link` done once. Truncates and reloads all tables.
import { createReadStream, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parse } from "csv-parse";

const dataDir = process.argv[2] ?? join(process.env.HOME, "Junction-2026-S-pankki");
const BATCH_ROWS = Number(process.env.BATCH_ROWS ?? 20000);
const workDir = mkdtempSync(join(tmpdir(), "s-pankki-load-"));

const MONTHS = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };

// SAS datetime "03OCT24:09:04:04" -> "2024-10-03 09:04:04"
function sasTs(v) {
  const m = /^(\d{2})([A-Z]{3})(\d{2}):(\d{2}:\d{2}:\d{2})$/.exec(v);
  if (!m || !MONTHS[m[2]]) throw new Error(`Bad timestamp: ${v}`);
  return `20${m[3]}-${MONTHS[m[2]]}-${m[1]} ${m[4]}`;
}

const lit = (v) => (v === "" || v == null ? "NULL" : `'${String(v).replaceAll("'", "''")}'`);

function runSql(sql) {
  const file = join(workDir, "batch.sql");
  writeFileSync(file, sql);
  execFileSync("npx", ["supabase", "db", "query", "--remote", "--yes", "-f", file], {
    stdio: ["ignore", "ignore", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

// table, file, [targetColumn, sourceColumn, convert?]
const same = (...cs) => cs.map((c) => [c, c]);
const loads = [
  ["customers", "tx_customers_junction.csv",
    same("customer_id", "customer_postal_code", "customer_age")],
  ["mortgage_applications", "mtg_tx_customer_link_and_final_mtg_infio.csv", [
    ...same("mortgage_customer_id", "customer_id", "final_decision", "rejection_reason",
      "final_property_price_eur", "final_requested_loan_eur", "final_equity_amount_eur",
      "final_collateral_value_eur", "required_monthly_income_eur"),
    ["final_loan_to_value", "lfinal_loan_to_value"],
  ]],
  ["mortgage_events", "mtg_negotiation_history.csv", [
    ["mortgage_customer_id", "mortgage_customer_id"],
    ["event_timestamp", "timestamp", sasTs],
    ...same("event_type", "property_id", "property_type", "property_price_estimate",
      "loan_amount", "equity_amount", "collateral_type", "collateral_value",
      "collateral_status", "decision", "rejection_reason", "expense_type",
      "expense_amount", "note"),
  ]],
  ["transactions", "tx_junction_transactions.csv", [
    ...same("customer_id", "bank_account_id", "tx_date"),
    ["tx_timestamp", "tx_timestamp", sasTs],
    ...same("category", "tx_amount_eur", "balance_after_eur", "transaction_type",
      "merchant_id", "mcc_code"),
  ]],
];

try {
  runSql("truncate transactions, mortgage_events, mortgage_applications, customers restart identity;");

  for (const [table, file, cols] of loads) {
    const started = Date.now();
    const head = `insert into ${table} (${cols.map((c) => c[0]).join(", ")}) values\n`;
    let batch = [];
    let n = 0;
    const flush = () => {
      if (!batch.length) return;
      runSql(head + batch.join(",\n") + ";");
      batch = [];
      const s = (Date.now() - started) / 1000;
      process.stdout.write(`\r  ${table}: ${n.toLocaleString()} rows (${s.toFixed(0)}s)   `);
    };
    for await (const rec of createReadStream(join(dataDir, file)).pipe(parse({ columns: true, bom: true }))) {
      batch.push(`(${cols.map(([, src, fn]) => lit(rec[src] === "" ? "" : fn ? fn(rec[src]) : rec[src])).join(",")})`);
      n++;
      if (batch.length >= BATCH_ROWS) flush();
    }
    flush();
    console.log(`\r${table}: ${n.toLocaleString()} rows in ${((Date.now() - started) / 1000).toFixed(1)}s   `);
  }
  runSql("analyze;");
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
