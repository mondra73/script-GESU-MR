// export_completo_combinado.js
// Descarga TODOS los equipamientos En Servicio (Lampara, Columna, Tablero,
// Transversal) de las 3 zonas, deduplica por ID y genera un archivo JSON.
//
// Requiere Node 18+ (fetch nativo)
//
// Credenciales: se leen de variables de entorno USERNAME y PASSWORD
// (en GitHub Actions se configuran como Secrets)

const fs = require("fs");
const path = require("path");

// Cargar .env manualmente
try {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const lines = envContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key === "USERNAME" || key === "PASSWORD" || !process.env[key]) process.env[key] = value;
    }
    console.log("[.env] Archivo cargado correctamente.");
  }
} catch (err) {
  console.warn("[.env] No se pudo cargar el archivo .env:", err.message);
}

const BASE = "https://www.rosario.gob.ar/gesu-webapp";

const USERNAME = process.env.USERNAME || "";
const PASSWORD = process.env.PASSWORD || "";

if (!USERNAME || !PASSWORD) {
  console.error("ERROR: Las variables de entorno USERNAME y PASSWORD son obligatorias.");
  process.exit(1);
}

const FILTRO_TIPOS = [71, 43, 45, 44]; // Lampara, Columna, Tablero, Transversal
const ZONAS = [25, 26, 27];            // Zona 1, 2, 3 (sin Ascensores)

const FILTRO_CLASIFICACIONES = [
  318, 277, 310, 624, 616, 623, 618, 617, 619, 628, 630, 615, 311, 622, 315, 608, 609, 610, 611,
  634, 606, 605, 607, 621, 626, 613, 373, 362, 317, 372, 363, 367, 364, 424, 625, 638, 278, 620,
  368, 307, 309, 365, 421, 355, 369, 370, 366, 633, 691, 331, 358, 648, 325, 520, 360, 343, 354,
  522, 329, 359, 692, 324, 523, 322, 332, 627, 632, 313, 276, 319, 320, 374, 321, 323, 316, 423,
  357, 326, 327, 422, 328, 330, 371, 356, 314, 639, 629, 612, 312, 636, 631, 614, 341, 352, 344,
  347, 349, 351, 339, 635, 637
];

function parseCookies(setCookieHeaders) {
  const cookies = {};
  for (const line of setCookieHeaders) {
    const [pair] = line.split(";");
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    cookies[name] = value;
  }
  return cookies;
}

function cookieHeader(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function login() {
  let cookies = {};

  const preLoginResp = await fetch(`${BASE}/login`, {
    method: "GET",
    redirect: "manual",
  });
  const setCookiePre = preLoginResp.headers.getSetCookie
    ? preLoginResp.headers.getSetCookie()
    : [];
  cookies = { ...cookies, ...parseCookies(setCookiePre) };

  const loginBody = new URLSearchParams({
    username: USERNAME,
    password: PASSWORD,
    login: "",
  });

  const loginResp = await fetch(`${BASE}/j_security_check`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookieHeader(cookies),
    },
    body: loginBody.toString(),
    redirect: "manual",
  });

  const setCookieLogin = loginResp.headers.getSetCookie
    ? loginResp.headers.getSetCookie()
    : [];
  cookies = { ...cookies, ...parseCookies(setCookieLogin) };

  const location = loginResp.headers.get("location") || "";
  if (loginResp.status !== 302 || location.includes("error")) {
    throw new Error("Login fallido.");
  }

  console.log("Login OK.");
  return cookies;
}

async function exportarZona(cookies, idArea) {
  const params = new URLSearchParams();
  for (const t of FILTRO_TIPOS) {
    params.append("filtroTipos", String(t));
  }
  params.append("d-5687999-e", "1");
  for (const c of FILTRO_CLASIFICACIONES) {
    params.append("filtroClasificaciones", String(c));
  }
  params.append("filtroDireccion", "15");
  params.append("6578706f7274", "1");
  params.append("filtroEstados", "5");
  params.append("filtroArea", String(idArea));

  const url = `${BASE}/equipamiento?${params.toString()}`;

  const inicio = Date.now();
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "Cookie": cookieHeader(cookies),
      "Referer": `${BASE}/equipamiento`,
    },
  });

  if (!resp.ok) {
    throw new Error(`Fallo al exportar zona idArea=${idArea}: status ${resp.status}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  const tiempo = ((Date.now() - inicio) / 1000).toFixed(1);

  const contentType = resp.headers.get("content-type") || "";
  if (!contentType.includes("csv")) {
    throw new Error(`Respuesta inesperada para idArea=${idArea} (content-type: ${contentType})`);
  }

  console.log(`  Zona idArea=${idArea}: ${tiempo}s, ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

  return buffer.toString("utf8");
}

function parsearCSV(texto) {
  const lineas = texto.split("\n").filter(linea => linea.trim() !== "");
  if (lineas.length === 0) return [];

  const headers = lineas[0].split(",");
  const filas = lineas.slice(1);

  return filas.map(linea => {
    // Split simple por coma (asumimos que no hay comas dentro de los campos)
    const valores = linea.split(",");
    const obj = {};
    headers.forEach((header, i) => {
      obj[header.trim()] = (valores[i] || "").trim();
    });
    return obj;
  });
}

async function main() {
  const cookies = await login();

  console.log("\n== Descargando cada zona por separado ==");

  const todasLasFilas = [];
  const idsVistos = new Set();

  for (const idArea of ZONAS) {
    console.log(`Zona idArea=${idArea}...`);
    const texto = await exportarZona(cookies, idArea);
    const filas = parsearCSV(texto);

    let agregadas = 0;
    let duplicadas = 0;

    for (const fila of filas) {
      const id = fila["ID"] || "";
      if (!id) continue;
      if (!idsVistos.has(id)) {
        idsVistos.add(id);
        todasLasFilas.push(fila);
        agregadas++;
      } else {
        duplicadas++;
      }
    }

    console.log(`  Filas nuevas: ${agregadas}, duplicadas (omitidas): ${duplicadas}`);
  }

  // Armar el JSON final
  const resultado = {
    actualizado: new Date().toISOString(),
    total: todasLasFilas.length,
    datos: todasLasFilas,
  };

  // Guardar JSON sin comprimir (para debug local si hace falta)
  const jsonPath = "datos_completos.json";
  fs.writeFileSync(jsonPath, JSON.stringify(resultado), "utf8");

  // Guardar JSON comprimido con gzip (para GitHub, ~15-20 MB)
  const zlib = require("zlib");
  const gzipPath = "datos_completos.json.gz";
  const jsonString = JSON.stringify(resultado);
  const comprimido = zlib.gzipSync(jsonString);
  fs.writeFileSync(gzipPath, comprimido);

  console.log("\n== Resultado ==");
  console.log(`Total de registros únicos: ${todasLasFilas.length}`);
  console.log(`JSON sin comprimir: ${(fs.statSync(jsonPath).size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`JSON comprimido (gzip): ${(fs.statSync(gzipPath).size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});