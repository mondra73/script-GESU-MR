// convertir_ids.js
const fs = require("fs");
const path = require("path");

let entrada = "";
try {
  const envPath = path.join(__dirname, ".env-entrada");
  if (fs.existsSync(envPath)) {
    entrada = fs.readFileSync(envPath, "utf-8");
  }
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
}

const lineas = entrada.split(/\r?\n/);
const ids = [];

for (const linea of lineas) {
  const trimmed = linea.trim();
  if (trimmed === "" || trimmed.toUpperCase() === "ID") continue;
  if (trimmed.startsWith("IDS_CONVERSION_ENTRADA=")) {
    const valor = trimmed.split("=")[1];
    if (valor && /^\d+$/.test(valor)) ids.push(Number(valor));
    continue;
  }
  if (/^\d+$/.test(trimmed)) ids.push(Number(trimmed));
}

console.log("Total IDs:", ids.length);
console.log("Primeros 3:", ids.slice(0, 3));
console.log("");
console.log("IDS_ACTUALIZAR_UBICACIONES=" + ids.join(","));
