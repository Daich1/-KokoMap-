// debug-failed-spots.mjs
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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const ids = [
        'c790c55c-a0ea-4b9c-8e1c-f1cd6a02fda3',
        'a729ab2d-e495-438d-bbe0-3dd1d5f30c1d',
        '7e25d1f4-4ac4-46bb-9ce8-7d4d329b017a'
    ];
    const { data, error } = await supabase
        .from('places')
        .select('name, opening_hours_text')
        .in('id', ids);

    if (error) {
        console.error(error);
        return;
    }
    console.log(JSON.stringify(data, null, 2));
}

main();
