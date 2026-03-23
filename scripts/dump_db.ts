import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkData() {
    const { data, error } = await supabase
        .from("places")
        .select("id, name, business_hours, opening_hours_text");

    if (error) {
        console.error(error);
        return;
    }

    fs.writeFileSync("db_dump.json", JSON.stringify(data, null, 2));
    console.log("Dumped", data.length, "places to db_dump.json");
}

checkData();
