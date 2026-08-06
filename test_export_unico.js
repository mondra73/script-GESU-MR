// test_export_zona_unica.js
// Misma prueba que test_export_unico.js pero limitada a UNA sola zona,
// para confirmar si el problema es el volumen total de datos (~172k filas)
// o algo estructural del filtro.
//
// Requiere Node 18+ (fetch nativo)

const fs = require("fs");

const BASE = "https://www.rosario.gob.ar/gesu-webapp";

const USERNAME = "jespino2";
const PASSWORD = "Javier2@26";

// Tipos: 71=Lampara, 43=Columna, 45=Tablero, 44=Transversal
const FILTRO_TIPOS = [71, 43, 45, 44];

// Una sola zona para esta prueba (cambiar aca si se quiere probar otra: 25, 26 o 27)
const FILTRO_AREA = [25];

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

async function main() {
  const cookies = await login();

  const params = new URLSearchParams();
  for (const t of FILTRO_TIPOS) {
    params.append("filtroTipos", String(t));
  }
  params.append("d-5687999-e", "1"); // 1 = CSV
  for (const c of FILTRO_CLASIFICACIONES) {
    params.append("filtroClasificaciones", String(c));
  }
  params.append("filtroDireccion", "15");
  params.append("6578706f7274", "1");
  params.append("filtroEstados", "5");
  for (const a of FILTRO_AREA) {
    params.append("filtroArea", String(a));
  }

  const url = `${BASE}/equipamiento?${params.toString()}`;

  console.log(`\n== Pidiendo export de zona unica (filtroArea=${FILTRO_AREA.join(",")}), todos los tipos ==`);
  console.log("Esperando respuesta...\n");

  const inicio = Date.now();

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "Cookie": cookieHeader(cookies),
      "Referer": `${BASE}/equipamiento`,
    },
  });

  const tiempoRespuestaHeaders = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(`Headers recibidos en ${tiempoRespuestaHeaders}s. Status: ${resp.status}`);
  console.log("Content-Type:", resp.headers.get("content-type"));

  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => "");
    console.error("ERROR. Preview:", bodyText.slice(0, 500));
    process.exit(1);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  const tiempoTotal = ((Date.now() - inicio) / 1000).toFixed(1);

  const contentType = resp.headers.get("content-type") || "";
  if (!contentType.includes("csv")) {
    const bodyText = buffer.toString("utf8");
    fs.writeFileSync("debug_zona_unica_no_csv.html", bodyText);
    console.error("ADVERTENCIA: no parece ser un CSV. Guardado en debug_zona_unica_no_csv.html");
    console.error("Titulo de la pagina:", (bodyText.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    process.exit(1);
  }

  fs.writeFileSync("export_zona_unica_todos.csv", buffer);
  const cantidadLineas = buffer.toString("utf8").split("\n").length;

  console.log("\n== Resultado ==");
  console.log(`Tiempo total (descarga completa): ${tiempoTotal}s`);
  console.log(`Tamaño del archivo: ${(buffer.length / 1024 / 1024).toFixed(2)} MB (${buffer.length} bytes)`);
  console.log(`Cantidad de líneas (aprox filas + header): ${cantidadLineas}`);
  console.log(`Archivo guardado como: export_zona_unica_todos.csv`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});