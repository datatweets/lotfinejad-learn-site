// Synthetic, seed-pinned practice dataset "shop-synth-v1": a made-up shop, NOT real customers or real data.
// Pure JS with no Node APIs, so the same generator can run in the browser SQL workbench (WP-05).
const NAMES = ["آرین", "بهاره", "پویا", "ترانه", "جواد", "چکاوک", "حمید", "خاطره", "داریوش", "رها", "زهرا", "سینا", "شیرین", "فرهاد", "کیانا", "گلناز", "لیلا", "مهدی", "نگار", "هومن"];
const FAMILIES = ["احمدی", "بهرامی", "جعفری", "رضایی", "صالحی", "فرهادی", "کریمی", "موسوی"];
const CITIES = ["تهران", "شیراز", "تبریز", "اصفهان", "مشهد"];
const STATUSES = ["paid", "paid", "paid", "pending", "cancelled"];

function prng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const day = n => { const d = new Date(Date.UTC(2026, 0, 1) + n * 86400000); return d.toISOString().slice(0, 10); };

export function shopStatements(seed = 20261105, customers = 40, orders = 200) {
  const r = prng(seed);
  const out = [
    "CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL, signup_date TEXT NOT NULL)",
    "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), amount INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)"
  ];
  for (let id = 1; id <= customers; id++) out.push(`INSERT INTO customers VALUES (${id}, '${pick(r, NAMES)} ${pick(r, FAMILIES)}', '${pick(r, CITIES)}', '${day(Math.floor(r() * 120))}')`);
  for (let id = 1; id <= orders; id++) out.push(`INSERT INTO orders VALUES (${id}, ${1 + Math.floor(r() * customers)}, ${(1 + Math.floor(r() * 400)) * 10000}, '${pick(r, STATUSES)}', '${day(120 + Math.floor(r() * 200))}')`);
  return out;
}
