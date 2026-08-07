// export_zonas.js
// Flujo completo: login -> por cada zona (seleccionar + exportar CSV)
// Requiere Node 18+ (fetch nativo)

const fs = require("fs");

const BASE = "https://www.rosario.gob.ar/gesu-webapp";

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
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch (err) {}

const USERNAME = process.env.USERNAME || "";
const PASSWORD = process.env.PASSWORD || "";

// idArea de cada zona (segun el <select id="areas"> del home)
const ZONAS = [
  { nombre: "zona1", idArea: 25 },
  { nombre: "zona2", idArea: 26 },
  { nombre: "zona3", idArea: 27 },
];

// La lista larga de filtroClasificaciones (representa "todas las clasificaciones",
// no cambia entre zonas - viene fija del link que capturaste en el navegador)
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
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login() {
  let cookies = {};

  // 0. GET inicial a /login para obtener cookie de sesion previa (necesaria para que el POST no sea rechazado)
  console.log("== Login: GET inicial a /login ==");
  const preLoginResp = await fetch(`${BASE}/login`, {
    method: "GET",
    redirect: "manual",
  });
  const setCookiePre = preLoginResp.headers.getSetCookie
    ? preLoginResp.headers.getSetCookie()
    : [];
  cookies = { ...cookies, ...parseCookies(setCookiePre) };

  // 1. POST del login
  console.log("== Login: POST credenciales ==");
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

  console.log("Status login:", loginResp.status);
  console.log("Location del redirect:", loginResp.headers.get("location"));

  const setCookieLogin = loginResp.headers.getSetCookie
    ? loginResp.headers.getSetCookie()
    : [];
  cookies = { ...cookies, ...parseCookies(setCookieLogin) };

  const location = loginResp.headers.get("location") || "";
  if (loginResp.status !== 302 || location.includes("error")) {
    throw new Error("Login fallido. Revisar usuario/contraseña.");
  }

  console.log("Login OK. Cookies:", cookies);
  return cookies;
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

  console.log(`  seleccionarAmbito (idArea=${idArea}) -> status ${resp.status}`);

  const setCookie = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [];
  if (setCookie.length) {
    Object.assign(cookies, parseCookies(setCookie));
  }

  if (!resp.ok) {
    throw new Error(`Fallo al seleccionar zona idArea=${idArea}: status ${resp.status}`);
  }
}

async function exportarCSV(cookies, idArea, nombreArchivo) {
  const params = new URLSearchParams();
  params.append("filtroTipos", "71");
  params.append("d-5687999-e", "1"); // 1 = CSV
  for (const c of FILTRO_CLASIFICACIONES) {
    params.append("filtroClasificaciones", String(c));
  }
  params.append("filtroDireccion", "15");
  params.append("6578706f7274", "1");
  params.append("filtroEstados", "5");
  params.append("filtroArea", String(idArea));

  const url = `${BASE}/equipamiento?${params.toString()}`;

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "Cookie": cookieHeader(cookies),
      "Referer": `${BASE}/equipamiento`,
    },
  });

  console.log(`  export -> status ${resp.status}, content-type: ${resp.headers.get("content-type")}`);

  if (!resp.ok) {
    throw new Error(`Fallo al exportar idArea=${idArea}: status ${resp.status}`);
  }

  const contentType = resp.headers.get("content-type") || "";
  if (!contentType.includes("csv")) {
    const bodyText = await resp.text().catch(() => "");
    console.error("  ADVERTENCIA: no parece ser un CSV. Preview:", bodyText.slice(0, 300));
    throw new Error(`Respuesta inesperada para idArea=${idArea} (content-type: ${contentType})`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(nombreArchivo, buffer);
  console.log(`  Guardado: ${nombreArchivo} (${buffer.length} bytes)`);
}

async function main() {
  const cookies = await login();

  for (const zona of ZONAS) {
    console.log(`\n== Procesando ${zona.nombre} (idArea=${zona.idArea}) ==`);
    await seleccionarZona(cookies, zona.idArea);
    await sleep(1000); // pequeña pausa para no saturar el backend
    await exportarCSV(cookies, zona.idArea, `${zona.nombre}.csv`);
    await sleep(1500);
  }

  console.log("\n== Listo. Archivos generados: ==");
  for (const zona of ZONAS) {
    console.log(`- ${zona.nombre}.csv`);
  }
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
