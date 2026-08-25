// filtrar_ya_subidos.js
// Resta los registros de losqueyasesubieron.csv del archivo subida_zona2_final.csv
// Genera subida_zona2_pendientes.csv con los que faltan subir

const fs = require("fs");
const path = require("path");

const CARPETA = "documentos";

console.log("Cargando archivos...");

// 1. Leer subida_zona2_final.csv (los que queríamos subir)
const rutaFinal = path.join(CARPETA, "subida_zona2_final.csv");
const csvFinal = fs.readFileSync(rutaFinal, "utf8");
const lineasFinal = csvFinal.split("\n").filter(l => l.trim() !== "");
const headerFinal = lineasFinal[0];

// La columna ID está en el índice 14 (columna 15 en el CSV original)
const idxID_Final = 14;

console.log(`Registros en subida_zona2_final.csv: ${lineasFinal.length - 1}`);

// 2. Leer losqueyasesubieron.csv
const rutaSubidos = path.join(CARPETA, "losqueyasesubieron.csv");
const csvSubidos = fs.readFileSync(rutaSubidos, "utf8");
const lineasSubidos = csvSubidos.split("\n").filter(l => l.trim() !== "");
const headersSubidos = lineasSubidos[0].split(",").map(h => h.trim());

const idxID_Subidos = headersSubidos.indexOf("ID");
if (idxID_Subidos === -1) {
  console.error("No se encontró columna ID en losqueyasesubieron.csv");
  console.error("Headers:", headersSubidos);
  process.exit(1);
}

console.log(`Registros ya subidos: ${lineasSubidos.length - 1}`);

// 3. Construir set de IDs ya subidos
const idsSubidos = new Set();

for (let i = 1; i < lineasSubidos.length; i++) {
  const valores = lineasSubidos[i].split(",");
  const id = (valores[idxID_Subidos] || "").trim();
  if (id) idsSubidos.add(id);
}

console.log(`IDs ya subidos: ${idsSubidos.size}`);

// 4. Filtrar los que todavía no se subieron
const pendientes = [];

for (let i = 1; i < lineasFinal.length; i++) {
  const linea = lineasFinal[i];
  const valores = linea.split(",");
  const id = (valores[idxID_Final] || "").trim();
  
  if (!idsSubidos.has(id)) {
    pendientes.push(linea);
  }
}

console.log("\n" + "=".repeat(60));
console.log("  RESULTADOS");
console.log("=".repeat(60));
console.log(`Registros totales: ${lineasFinal.length - 1}`);
console.log(`Ya subidos: ${idsSubidos.size}`);
console.log(`Pendientes: ${pendientes.length}`);
console.log("");

// 5. Guardar CSV de pendientes
const csvPendientes = [headerFinal, ...pendientes].join("\n");
fs.writeFileSync(path.join(CARPETA, "subida_zona2_pendientes.csv"), csvPendientes);

console.log(`Archivo guardado: subida_zona2_pendientes.csv`);
console.log(`Total filas (incluyendo header): ${pendientes.length + 1}`);