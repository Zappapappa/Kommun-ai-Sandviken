import axios from "axios";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import crypto from "crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// Använd SERVICE ROLE KEY här (från .env)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Multi-tenant: Sandviken tenant ID
const TENANT_ID = process.env.TENANT_ID || 'fda40f49-f0bf-47eb-b2dc-675e7385dc42';

// 1) Hämta och rensa läsbar text
async function fetchCleanPage(url) {
  const { data: html } = await axios.get(url, { timeout: 20000 });
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const title = article?.title?.trim() || url;
  const content = (article?.textContent || "").trim();
  const hash = crypto.createHash("sha1").update(content).digest("hex");
  return { url, title, content, hash };
}

// 2) Spara/upsert i Supabase (bara om ändrat) - multi-tenant
async function upsertPage(row) {
  const { data: existing, error: selErr } = await supabase
    .from("pages")
    .select("id, hash")
    .eq("tenant_id", TENANT_ID)
    .eq("url", row.url)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing && existing.hash === row.hash) {
    console.log("⏩ Oförändrad:", row.url);
    return;
  }

  // Lägg till tenant_id i row
  const rowWithTenant = { ...row, tenant_id: TENANT_ID };
  
  if (existing) {
    // Update existing row
    const { error } = await supabase
      .from("pages")
      .update(rowWithTenant)
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    // Insert new row
    const { error } = await supabase
      .from("pages")
      .insert(rowWithTenant);
    if (error) throw error;
  }
  
  console.log("✅ Sparad/uppdaterad:", row.title);
}

// 3) Kör på ett par bygglov-URL:er (börja litet)
async function run() {
  // ingest.js → i run()
const urls = [
  // Bygglov och bygga
  "https://sandviken.se/byggaboochmiljo/bygganyttandraellerriva/behoverjagbygglov.21616.html",
  "https://sandviken.se/byggaboochmiljo/bygganyttandraellerriva/ritningarochansokanibyggarenden.10386.html",
  "https://sandviken.se/byggaboochmiljo/bygganyttandraellerriva/vadkostarbygglovochanmalan.24787.html",
  "https://sandviken.se/byggaboochmiljo/bygganyttandraellerriva/bygglovsprocessfranidetillslutbesked.22665.html",
  "https://sandviken.se/byggaboochmiljo/bygganyttandraellerriva/behoverjagbygglov/bygglovforvilla.24729.html",
  "https://sandviken.se/byggaboochmiljo/bygganyttandraellerriva/behoverjagbygglov/bygglovfortillbyggnad.24733.html",
  "https://sandviken.se/byggaboochmiljo/bygganyttandraellerriva/behoverjagbygglov/byggaaltan.24776.html",
  "https://sandviken.se/byggaboochmiljo/bygganyttandraellerriva/behoverjagbygglov/bygglovforinglasningar.24682.html",
  
  // Omsorg och stöd
  "https://sandviken.se/omsorgochstod.3867.html",
  "https://sandviken.se/omsorgochstod/akuthjalp.3868.html",
  "https://sandviken.se/omsorgochstod/funktionsnedsattning/parkeringstillstandforrorelsehindrade.3869.html",
  "https://sandviken.se/omsorgochstod/ekonomisktstodochradgivning.4231.html",
  
  // Kommun och politik
  "https://sandviken.se/kommunochpolitik/kontaktaoss.18910.html",
];



  for (const url of urls) {
    try {
      console.log("🔹 Hämtar:", url);
      const page = await fetchCleanPage(url);
      if (!page.content) {
        console.log("⚠️ Ingen läsbar text hittad:", url);
        continue;
      }
      await upsertPage(page);
    } catch (e) {
      console.error("❌ Fel på", url, e.message);
    }
  }

  console.log("🎉 Klar. Kolla tabellen 'pages' i Supabase.");
}

run();
