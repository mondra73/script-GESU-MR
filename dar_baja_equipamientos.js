// dar_baja_equipamientos.js
// Flujo: login -> por cada ID, buscar en bajaequipamiento -> verificar duplicados ->
// si es único, dar de baja con fecha del día.
//
// Requiere Node 18+ (fetch nativo) y cheerio:
//   npm install cheerio

const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

// Cargar .env manualmente (sin dependencias externas)
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
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    console.log("[.env] Archivo cargado correctamente.");
  }
} catch (err) {
  console.warn("[.env] No se pudo cargar el archivo .env:", err.message);
}

const BASE = "https://www.rosario.gob.ar/gesu-webapp";

const USERNAME = "rsalvia0";
const PASSWORD = "Destileriasonora5150";

// Leer IDs desde variable de entorno
const IDS = process.env.IDS_BAJA_EQUIPAMIENTOS
  ? process.env.IDS_BAJA_EQUIPAMIENTOS.split(",").map(id => parseInt(id.trim(), 10))
  : [];

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    throw new Error("Login fallido. Revisar usuario/contraseña.");
  }

  console.log("Login OK.");
  return cookies;
}

async function buscarDuplicados(cookies, id) {
  const searchBody = new URLSearchParams({ patron: String(id) });

  const resp = await fetch(`${BASE}/equipamiento/bajaequipamiento`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookieHeader(cookies),
      "Referer": `${BASE}/equipamiento/bajaequipamiento`,
    },
    body: searchBody.toString(),
  });

  if (!resp.ok) {
    throw new Error(`Fallo al buscar id=${id}: status ${resp.status}`);
  }

  const html = await resp.text();
  const $ = cheerio.load(html);

  const idsEncontrados = [];
  $("td.columna-id").each((i, el) => {
    const texto = $(el).text().trim();
    if (texto) {
      idsEncontrados.push(texto);
    }
  });

  const coincidenciasExactas = idsEncontrados.filter(
    (idEncontrado) => idEncontrado === String(id)
  );

  return coincidenciasExactas.length;
}

async function darDeBaja(cookies, id) {
  const hoy = new Date();
  const fecha = `${String(hoy.getDate()).padStart(2, "0")}/${String(hoy.getMonth() + 1).padStart(2, "0")}/${hoy.getFullYear()}`;

  const body = new URLSearchParams({
    id: String(id),
    fecha: fecha,
  });

  const resp = await fetch(`${BASE}/equipamiento/bajaequipamiento/bajaEquipamiento`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Cookie": cookieHeader(cookies),
      "Referer": `${BASE}/equipamiento/bajaequipamiento`,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => "");
    throw new Error(`Fallo al dar de baja id=${id}: status ${resp.status}. Respuesta: ${bodyText.slice(0, 200)}`);
  }

  const respuestaTexto = await resp.text();
  return respuestaTexto;
}

async function main() {
  if (IDS.length === 0) {
    console.error("No hay IDs cargados en la variable IDS_BAJA_EQUIPAMIENTOS del archivo .env");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("  SCRIPT DE BAJA DE EQUIPAMIENTOS");
  console.log("=".repeat(60));
  console.log(`  IDs a procesar: ${IDS.length}`);
  console.log("");

  const cookies = await login();

  const resultados = {
    ok: [],
    duplicados: [],
    noEncontrado: [],
    error: [],
  };

  let procesados = 0;

  for (const id of IDS) {
    procesados++;
    process.stdout.write(`[${procesados}/${IDS.length}] Procesando id=${id} ... `);

    try {
      const cantidad = await buscarDuplicados(cookies, id);

      if (cantidad === 0) {
        console.log(`NO ENCONTRADO`);
        resultados.noEncontrado.push(id);
      } else if (cantidad > 1) {
        console.log(`⚠ DUPLICADO (${cantidad} registros) - NO se eliminó`);
        resultados.duplicados.push({ id, cantidad });
      } else {
        const respuesta = await darDeBaja(cookies, id);
        console.log(`OK - ${respuesta.trim()}`);
        resultados.ok.push(id);
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      resultados.error.push({ id, error: err.message });
    }

    if (procesados < IDS.length) {
      await sleep(1000);
    }
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("  RESUMEN");
  console.log("=".repeat(60));

  if (resultados.ok.length > 0) {
    console.log(`✅ Dados de baja (${resultados.ok.length}):`);
    console.log(`   ${resultados.ok.join(", ")}`);
  }

  if (resultados.duplicados.length > 0) {
    console.log(`⚠ Duplicados - NO eliminados (${resultados.duplicados.length}):`);
    resultados.duplicados.forEach((d) =>
      console.log(`   id=${d.id}: ${d.cantidad} registros duplicados`)
    );
  }

  if (resultados.noEncontrado.length > 0) {
    console.log(`❓ No encontrados (${resultados.noEncontrado.length}):`);
    console.log(`   ${resultados.noEncontrado.join(", ")}`);
  }

  if (resultados.error.length > 0) {
    console.log(`❌ Con error (${resultados.error.length}):`);
    resultados.error.forEach((e) =>
      console.log(`   id=${e.id}: ${e.error}`)
    );
  }

  console.log("");
  console.log(`Total: ${resultados.ok.length} OK | ${resultados.duplicados.length} duplicados | ${resultados.noEncontrado.length} no encontrados | ${resultados.error.length} errores`);
}

main().catch((err) => {
  console.error("\nError inesperado:", err.message);
  process.exit(1);
});