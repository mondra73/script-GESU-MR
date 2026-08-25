// cruzar_zona2.js
// Cruza zona2-columnas.csv con Zona2-limpio-separado.csv
// Genera subida_zona2_final.csv con los registros a subir + datos complementarios

const fs = require("fs");
const path = require("path");

console.log("Cargando archivos...");

const CARPETA = "documentos";

// 1. Leer zona2-columnas.csv (los que hay que subir)
const rutaSubir = path.join(CARPETA, "zona2-columnas.csv");
const csvSubir = fs.readFileSync(rutaSubir, "utf8");
const lineasSubir = csvSubir.split("\n").filter(l => l.trim() !== "");
const headersSubir = lineasSubir[0].split(",").map(h => h.trim());

const idxID_Subir = 14; // Columna 15 en Excel = índice 14 en JS // La columna ID está en la posición 15 (header vacío)
if (idxID_Subir === -1) {
  console.error("No se encontró columna ID en zona2-columnas.csv");
  console.error("Headers:", headersSubir);
  process.exit(1);
}

console.log(`Registros a subir: ${lineasSubir.length - 1}`);

// 2. Leer Zona2-limpio-separado.csv (datos complementarios)
const rutaCompleto = path.join(CARPETA, "Zona2-limpio-separado.csv");
const csvCompleto = fs.readFileSync(rutaCompleto, "utf8");
const lineasCompleto = csvCompleto.split("\n").filter(l => l.trim() !== "");
const headersCompleto = lineasCompleto[0].split(",").map(h => h.trim());

// Buscar columnas con nombres con o sin acentos
function encontrarIndice(headers, nombre) {
  const idx = headers.indexOf(nombre);
  if (idx !== -1) return idx;
  // Buscar sin acentos
  const nombreSinAcentos = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (h === nombreSinAcentos) return i;
  }
  return -1;
}

const idxID_Completo = encontrarIndice(headersCompleto, "ID Equip");
// Los índices están corridos por la columna combinada
const idxAlimentacion = 23;
const idxJabalina = 24;
const idxTipoColumna = 25;

if (idxID_Completo === -1) {
  console.error("No se encontró columna 'ID Equip' en Zona2-limpio-separado.csv");
  console.error("Headers:", headersCompleto);
  process.exit(1);
}

console.log(`Registros con datos complementarios: ${lineasCompleto.length - 1}`);

// 3. Construir mapa de ID -> datos complementarios
const mapaComplementarios = new Map();

for (let i = 1; i < lineasCompleto.length; i++) {
  const valores = lineasCompleto[i].split(",");
  const id = (valores[idxID_Completo] || "").trim();
  if (!id) continue;
  
  const alimentacion = (valores[idxAlimentacion] || "").trim();
  const jabalina = (valores[idxJabalina] || "").trim();
  const tipoColumna = (valores[idxTipoColumna] || "").trim();
  
  mapaComplementarios.set(id, { alimentacion, jabalina, tipoColumna });
}

console.log(`IDs con datos complementarios: ${mapaComplementarios.size}`);

// 4. Cruzar y generar CSV final
const registrosFinales = [];
const sinComplementarios = [];

for (let i = 1; i < lineasSubir.length; i++) {
  const linea = lineasSubir[i].trim();
  if (!linea) continue;
  
  const valores = linea.split(",");
  const id = (valores[idxID_Subir] || "").trim();
  
  if (mapaComplementarios.has(id)) {
    const comp = mapaComplementarios.get(id);
    const lineaFinal = linea + "," + comp.alimentacion + "," + comp.jabalina + "," + comp.tipoColumna;
    registrosFinales.push(lineaFinal);
  } else {
    sinComplementarios.push(id);
  }
}

console.log("\n" + "=".repeat(60));
console.log("  RESULTADOS");
console.log("=".repeat(60));
console.log(`Registros a subir: ${lineasSubir.length - 1}`);
console.log(`Con datos complementarios encontrados: ${registrosFinales.length}`);
console.log(`Sin datos complementarios (revisar): ${sinComplementarios.length}`);
if (sinComplementarios.length > 0) {
  console.log("  IDs sin complementarios:", sinComplementarios.join(", "));
}
console.log("");

// 5. Guardar CSV final
const headerFinal = lineasSubir[0] + ",Alimentación,Jabalina,Tipo de Columna";
const csvFinal = [headerFinal, ...registrosFinales].join("\n");
fs.writeFileSync("subida_zona2_final.csv", csvFinal);

console.log(`Archivo guardado: subida_zona2_final.csv`);
console.log(`Total filas (incluyendo header): ${registrosFinales.length + 1}`);