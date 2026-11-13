import { supabase } from "./supabase.js";

// Lists auth users (page size 1) — works on any project without needing a table.
const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });

if (error) {
  console.error("Supabase connection failed:", error.message);
  process.exit(1);
}
console.log("Connected to Supabase ✔");
