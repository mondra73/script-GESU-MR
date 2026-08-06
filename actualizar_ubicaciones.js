// actualizar_ubicaciones.js
// Flujo: login -> por cada ID de lampara, GET del form, parsear campos habilitados,
// reenviar por POST simulando el click en "Actualizar ubicacion".
//
// Requiere Node 18+ (fetch nativo) y la libreria cheerio:
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

const USERNAME = "cmaldon0";
const PASSWORD = "Juana300";

// Leer IDs desde variable de entorno
const IDS = process.env.IDS_ACTUALIZAR_UBICACIONES
  ? process.env.IDS_ACTUALIZAR_UBICACIONES.split(",").map(id => parseInt(id.trim(), 10))
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

  // GET inicial a /login (necesario para que el POST no sea rechazado)
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

// Extrae del HTML del formulario todos los campos que el navegador
// enviaria al hacer submit (excluye disabled, botones no clickeados, etc.)
function parsearCamposFormulario(html) {
  const $ = cheerio.load(html);
  const form = $("#equipamientoForm");

  if (form.length === 0) {
    throw new Error("No se encontro el formulario #equipamientoForm en la respuesta.");
  }

  const campos = [];

  form.find("input, select, textarea").each((i, el) => {
    const $el = $(el);
    const tag = el.tagName.toLowerCase();
    const type = ($el.attr("type") || "").toLowerCase();
    const name = $el.attr("name");

    if (!name) return;
    if ($el.attr("disabled") !== undefined) return;
    if (type === "submit" || type === "button" || type === "file") return;

    if (type === "checkbox" || type === "radio") {
      if ($el.attr("checked") === undefined) return;
      campos.push([name, $el.attr("value") || "on"]);
      return;
    }

    if (tag === "select") {
      const selectedOption = $el.find("option[selected]").first();
      const value = selectedOption.length
        ? selectedOption.attr("value")
        : $el.find("option").first().attr("value");
      campos.push([name, value ?? ""]);
      return;
    }

    if (tag === "textarea") {
      campos.push([name, $el.text()]);
      return;
    }

    campos.push([name, $el.attr("value") ?? ""]);
  });

  return campos;
}

async function seleccionarZona(cookies, idArea) {
  const url = `${BASE}/home/seleccionarAmbito?idSecretaria=1&idDireccion=15&idArea=${idArea}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "Cookie": cookieHeader(cookies),
      "X-Requested-With": "XMLHttpRequest",
      "Referer": `${BASE}/app/home`,
    },
  });
  if (!resp.ok) {
    throw new Error(`Fallo al seleccionar zona idArea=${idArea}: status ${resp.status}`);
  }
}

// IDs de las 3 zonas segun el <select id="areas"> del home
const ZONAS_IDAREA = [25, 26, 27];
let ultimaZonaExitosa = ZONAS_IDAREA[0]; // empezamos probando por la ultima que funciono

async function obtenerHtmlFormulario(cookies, id) {
  const getUrl = `${BASE}/equipamiento/equipamientoForm?rid=1&id=${id}`;

  // Probamos primero la ultima zona que funciono, despues las demas
  const ordenIntentos = [
    ultimaZonaExitosa,
    ...ZONAS_IDAREA.filter((z) => z !== ultimaZonaExitosa),
  ];

  for (const idArea of ordenIntentos) {
    await seleccionarZona(cookies, idArea);

    const getResp = await fetch(getUrl, {
      method: "GET",
      headers: { "Cookie": cookieHeader(cookies) },
    });

    if (!getResp.ok) continue;

    const html = await getResp.text();

    if (html.includes('id="equipamientoForm"')) {
      ultimaZonaExitosa = idArea; // recordamos para el proximo ID
      return html;
    }
  }

  throw new Error(
    `No se encontro el formulario para id=${id} en ninguna de las 3 zonas.`
  );
}

async function actualizarUbicacion(cookies, id) {
  // 1. Obtener el HTML del formulario, probando las 3 zonas hasta encontrar el registro
  const html = await obtenerHtmlFormulario(cookies, id);
  const getUrl = `${BASE}/equipamiento/equipamientoForm?rid=1&id=${id}`;

  // 2. Parsear campos habilitados del formulario
  const campos = parsearCamposFormulario(html);

  // 3. Armar FormData (multipart) igual al que envia el navegador al submitear
  const formData = new FormData();
  for (const [k, v] of campos) {
    formData.append(k, v);
  }
  // Simula el click en el boton "Actualizar ubicacion"
  formData.append("actualizarUbicacion", "");

  // 4. POST
  const postUrl = `${BASE}/equipamiento/equipamientoForm`;
  const postResp = await fetch(postUrl, {
    method: "POST",
    headers: {
      "Cookie": cookieHeader(cookies),
      "Referer": getUrl,
    },
    body: formData,
    redirect: "manual",
  });

  // Se espera un 302 hacia busquedamapaForm si salio bien
  if (postResp.status !== 302) {
    const bodyText = await postResp.text().catch(() => "");
    throw new Error(
      `POST inesperado para id=${id}: status ${postResp.status}. ` +
      `Preview: ${bodyText.slice(0, 200)}`
    );
  }

  return true;
}

async function main() {
  if (IDS.length === 0) {
    console.error("No hay IDs cargados en la variable IDS_ACTUALIZAR_UBICACIONES del archivo .env");
    process.exit(1);
  }

  console.log(`IDs cargados desde .env: ${IDS.length}`);
  const cookies = await login();

  const resultados = { ok: [], error: [] };

    const inicio = Date.now();
  const total = IDS.length;

  for (let i = 0; i < IDS.length; i++) {
    const id = IDS[i];
    const actual = i + 1;

    // Calcular tiempo restante estimado
    const transcurrido = (Date.now() - inicio) / 1000;
    const restantes = total - actual;
    const segPorId = transcurrido / actual;
    const minRestantes = Math.ceil((restantes * segPorId) / 60);

    process.stdout.write(`[${actual}/${total}] id=${id} (~${minRestantes} min rest) ... `);
    try {
      await actualizarUbicacion(cookies, id);
      console.log("OK");
      resultados.ok.push(id);
    } catch (err) {
      console.log("ERROR:", err.message);
      resultados.error.push({ id, error: err.message });
    }
    await sleep(1500);
  }

  console.log("\n== Resumen ==");
  console.log(`Actualizados OK (${resultados.ok.length}):`, resultados.ok);
  if (resultados.error.length > 0) {
    console.log(`Con error (${resultados.error.length}):`);
    resultados.error.forEach((e) => console.log(`  id=${e.id}: ${e.error}`));
  }
}

main().catch((err) => {
  console.error("\nError inesperado:", err.message);
  process.exit(1);
});