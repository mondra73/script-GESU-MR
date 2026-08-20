// export_para_duplicados.js
// Descarga TODOS los registros sin deduplicar y los guarda como datos_con_duplicados.json.gz
// No modifica datos_completos.json.gz ni el workflow existente.
//
// Requiere Node 18+ (fetch nativo)

const fs = require("fs");
const zlib = require("zlib");
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

if (!PASSWORD) {
  console.error("ERROR: Falta PASSWORD en el .env");
  process.exit(1);
}

const FILTRO_TIPOS = [71, 43, 45, 44];
const ZONAS = [25, 26, 27];

const FILTRO_CLASIFICACIONES = [
  318,277,310,624,616,623,618,617,619,628,630,615,311,622,315,608,609,610,611,
  634,606,605,607,621,626,613,373,362,317,372,363,367,364,424,625,638,278,620,
  368,307,309,365,421,355,369,370,366,633,691,331,358,648,325,520,360,343,354,
  522,329,359,692,324,523,322,332,627,632,313,276,319,320,374,321,323,316,423,
  357,326,327,422,328,330,371,356,314,639,629,612,312,636,631,614,341,352,344,
  347,349,351,339,635,637
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
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
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
  for (const t of FILTRO_TIPOS) params.append("filtroTipos", String(t));
  params.append("d-5687999-e", "1");
  for (const c of FILTRO_CLASIFICACIONES) params.append("filtroClasificaciones", String(c));
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

  if (!resp.ok) throw new Error(`Fallo en zona ${idArea}: status ${resp.status}`);

  const buffer = Buffer.from(await resp.arrayBuffer());
  const tiempo = ((Date.now() - inicio) / 1000).toFixed(1);
  const contentType = resp.headers.get("content-type") || "";

  if (!contentType.includes("csv")) {
    throw new Error(`Respuesta inesperada para zona ${idArea} (content-type: ${contentType})`);
  }

  console.log(`  Zona ${idArea}: ${tiempo}s, ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
  return buffer.toString("utf8");
}

function parsearCSV(texto) {
  const lineas = texto.split("\n").filter(l => l.trim() !== "");
  if (lineas.length === 0) return [];
  const headers = lineas[0].split(",");
  return lineas.slice(1).map(linea => {
    const valores = linea.split(",");
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = (valores[i] || "").trim());
    return obj;
  });
}

async function main() {
  const cookies = await login();

  console.log("\n== Descargando cada zona (sin deduplicar) ==");
  const todos = [];

  for (const idArea of ZONAS) {
    console.log(`Zona ${idArea}...`);
    const texto = await exportarZona(cookies, idArea);
    const filas = parsearCSV(texto);
    todos.push(...filas);
    console.log(`  Filas: ${filas.length}`);
  }

  console.log(`\nTotal de registros (sin deduplicar): ${todos.length}`);

  const resultado = {
    actualizado: new Date().toISOString(),
    total: todos.length,
    datos: todos,
  };

  const jsonString = JSON.stringify(resultado);
  const comprimido = zlib.gzipSync(jsonString);
  fs.writeFileSync("datos_con_duplicados.json.gz", comprimido);

  console.log(`Archivo guardado: datos_con_duplicados.json.gz`);
  console.log(`Tamaño: ${(comprimido.length / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});