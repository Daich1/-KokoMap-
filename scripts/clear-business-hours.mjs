// clear-business-hours.mjs
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
    const { data, error } = await supabase
        .from("places")
        .update({ business_hours: null })
        .is("deleted_at", null);

    if (error) {
        console.error(error);
    } else {
        console.log("Successfully cleared business_hours for all active records.");
    }
}

main();
