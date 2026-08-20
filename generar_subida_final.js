// generar_subida_final.js
// Compara bajas-totales.csv con datos_completos.json.gz
// Genera subida_final_total.csv solo con los registros que NO están en servicio
// y que NO tienen otro registro idéntico en servicio.

const fs = require("fs");
const zlib = require("zlib");

console.log("Cargando datos...");

// 1. Cargar registros actuales (En Servicio)
const gzActual = fs.readFileSync("datos_completos.json.gz");
const jsonActual = JSON.parse(zlib.gunzipSync(gzActual).toString("utf8"));

console.log(`Registros actuales En Servicio: ${jsonActual.total}`);

// Crear sets para búsqueda rápida
const idsEnServicio = new Set();
const firmasEnServicio = new Set();

function normalizar(str) {
  return String(str || "").trim().toLowerCase();
}

function construirFirma(item) {
  return [
    normalizar(item["N.º Serie"] || item["Nº de serie"]),
    normalizar(item["Tipo"]),
    normalizar(item["Material"] || item["Clasificación"]),
    normalizar(item["Ubicacion"] || item["Tipo de ubicación"]),
    normalizar(item["Carac"] || item["Descripción"]),
    normalizar(item["Nombre Calle"] || item["Ubicación: Calle"]),
    normalizar(item["Altura"] || item["Ubicación: Altura"]),
    normalizar(item["Letra"] || item["Ubicación: Letra"]),
    normalizar(item["Bis"] || item["Ubicación: Bis"]),
    normalizar(item["Zona"] || item["Responsable"]),
    normalizar(item["Coordenada X"] || item["Ubicación: Coordenada X"]),
    normalizar(item["Coordenada Y"] || item["Ubicación: Coordenada Y"])
  ].join("|");
}

for (const item of jsonActual.datos) {
  const id = item["ID"] || "";
  if (id) idsEnServicio.add(id);
  
  const firma = construirFirma(item);
  firmasEnServicio.add(firma);
}

console.log(`IDs únicos En Servicio: ${idsEnServicio.size}`);
console.log(`Firmas únicas En Servicio: ${firmasEnServicio.size}`);

// 2. Cargar CSV de bajas
const csvBajas = fs.readFileSync("bajas-totales.csv", "utf8");
const lineasBajas = csvBajas.split("\n");
const headers = lineasBajas[0].split(",").map(h => h.trim());

// Mapear índices
const idxID = headers.indexOf("ID");
const idxSerie = headers.indexOf("N.º Serie");
const idxTipo = headers.indexOf("Tipo");
const idxMaterial = headers.indexOf("Material");
const idxUbicacion = headers.indexOf("Ubicacion");
const idxCarac = headers.indexOf("Carac");
const idxCalle = headers.indexOf("Nombre Calle");
const idxAltura = headers.indexOf("Altura");
const idxLetra = headers.indexOf("Letra");
const idxBis = headers.indexOf("Bis");
const idxZona = headers.indexOf("Zona");
const idxX = headers.indexOf("Coordenada X");
const idxY = headers.indexOf("Coordenada Y");

console.log("\nColumnas encontradas en el CSV de bajas:");
console.log("  ID:", idxID, "| Serie:", idxSerie, "| Tipo:", idxTipo, "| Material:", idxMaterial);
console.log("  Ubicacion:", idxUbicacion, "| Carac:", idxCarac, "| Calle:", idxCalle, "| Altura:", idxAltura);
console.log("  Letra:", idxLetra, "| Bis:", idxBis, "| Zona:", idxZona, "| X:", idxX, "| Y:", idxY);

// 3. Filtrar registros a restaurar
const aRestaurar = [];
const descartadosPorID = [];
const descartadosPorFirma = [];

for (let i = 1; i < lineasBajas.length; i++) {
  const linea = lineasBajas[i].trim();
  if (!linea) continue;
  
  const valores = linea.split(",");
  const id = (valores[idxID] || "").trim();
  if (!id) continue;
  
  // Regla 1: Si el ID está en servicio, descartar
  if (idsEnServicio.has(id)) {
    descartadosPorID.push(id);
    continue;
  }
  
  // Regla 2: Si existe otro registro igual en servicio, descartar
  const itemBaja = {
    "N.º Serie": (valores[idxSerie] || "").trim(),
    "Tipo": (valores[idxTipo] || "").trim(),
    "Material": (valores[idxMaterial] || "").trim(),
    "Ubicacion": (valores[idxUbicacion] || "").trim(),
    "Carac": (valores[idxCarac] || "").trim(),
    "Nombre Calle": (valores[idxCalle] || "").trim(),
    "Altura": (valores[idxAltura] || "").trim(),
    "Letra": (valores[idxLetra] || "").trim(),
    "Bis": (valores[idxBis] || "").trim(),
    "Zona": (valores[idxZona] || "").trim(),
    "Coordenada X": (valores[idxX] || "").trim(),
    "Coordenada Y": (valores[idxY] || "").trim()
  };
  
  const firmaBaja = construirFirma(itemBaja);
  
  if (firmasEnServicio.has(firmaBaja)) {
    descartadosPorFirma.push(id);
    continue;
  }
  
  // Si pasó ambas reglas, incluir
  aRestaurar.push(linea);
}

console.log("\n" + "=".repeat(60));
console.log("  RESULTADOS");
console.log("=".repeat(60));
console.log(`Total registros en bajas: ${lineasBajas.length - 1}`);
console.log(`Descartados porque el ID está en servicio: ${descartadosPorID.length}`);
console.log(`Descartados porque existe otro registro idéntico: ${descartadosPorFirma.length}`);
console.log(`Registros a restaurar: ${aRestaurar.length}`);
console.log("");

// 5. Deduplicar por firma (mismo ID + mismos campos = un solo registro)
const vistos = new Set();
const aRestaurarUnicos = [];

for (const linea of aRestaurar) {
  const valores = linea.split(",");
  const item = {
    "N.º Serie": (valores[idxSerie] || "").trim(),
    "Tipo": (valores[idxTipo] || "").trim(),
    "Material": (valores[idxMaterial] || "").trim(),
    "Ubicacion": (valores[idxUbicacion] || "").trim(),
    "Carac": (valores[idxCarac] || "").trim(),
    "Nombre Calle": (valores[idxCalle] || "").trim(),
    "Altura": (valores[idxAltura] || "").trim(),
    "Letra": (valores[idxLetra] || "").trim(),
    "Bis": (valores[idxBis] || "").trim(),
    "Zona": (valores[idxZona] || "").trim(),
    "Coordenada X": (valores[idxX] || "").trim(),
    "Coordenada Y": (valores[idxY] || "").trim()
  };
  
  const firma = construirFirma(item);
  if (!vistos.has(firma)) {
    vistos.add(firma);
    aRestaurarUnicos.push(linea);
  }
}

console.log(`Registros únicos a restaurar: ${aRestaurarUnicos.length}`);

// 4. Guardar CSV final
const csvFinal = [lineasBajas[0], ...aRestaurarUnicos].join("\n");
fs.writeFileSync("subida_final_total.csv", csvFinal);

console.log(`Archivo guardado: subida_final_total.csv`);
console.log(`Total filas (incluyendo header): ${aRestaurarUnicos.length + 1}`);