// check-failures.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envFile = readFileSync(".env.local", "utf-8");
const env = Object.fromEntries(
    envFile
        .split("\n")
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => {
            const idx = l.indexOf("=");
            const key = l.slice(0, idx).trim();
            const val = l.slice(idx + 1).trim().replace(/^"(.*)"$/, "$1");
            return [key, val];
        })
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
    const { data: places, error } = await supabase
        .from("places")
        .select("id, name, opening_hours_text, business_hours")
        .is("deleted_at", null);

    if (error) {
        console.error(error);
        return;
    }

    const failures = places.filter(p => p.opening_hours_text && p.opening_hours_text.trim() && !p.business_hours);
    console.log("Found", failures.length, "failures:");
    failures.forEach(f => console.log(`- ${f.name} (ID: ${f.id})`));
}

main();
