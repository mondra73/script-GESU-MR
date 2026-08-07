// encontrar_duplicados.js
// Escanea TODOS los equipamientos "En Servicio" (lámparas, columnas, tableros, transversales)
// recorriendo todas las páginas y encuentra los IDs duplicados.
//
// Requiere Node 18+ y cheerio: npm install cheerio

const cheerio = require("cheerio");

const BASE = "https://www.rosario.gob.ar/gesu-webapp";

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
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch (err) {}

const USERNAME = process.env.USERNAME || "";
const PASSWORD = process.env.PASSWORD || "";

// Parámetros de los filtros (En Servicio, todos los tipos, todas las zonas)
const QUERY_PARAMS = "filtroTipos=43&filtroTipos=71&filtroTipos=45&filtroTipos=44" +
    "&filtroClasificaciones=318&filtroClasificaciones=277&filtroClasificaciones=310" +
    "&filtroClasificaciones=624&filtroClasificaciones=616&filtroClasificaciones=623" +
    "&filtroClasificaciones=618&filtroClasificaciones=617&filtroClasificaciones=619" +
    "&filtroClasificaciones=628&filtroClasificaciones=630&filtroClasificaciones=615" +
    "&filtroClasificaciones=311&filtroClasificaciones=622&filtroClasificaciones=315" +
    "&filtroClasificaciones=608&filtroClasificaciones=609&filtroClasificaciones=610" +
    "&filtroClasificaciones=611&filtroClasificaciones=634&filtroClasificaciones=606" +
    "&filtroClasificaciones=605&filtroClasificaciones=607&filtroClasificaciones=621" +
    "&filtroClasificaciones=626&filtroClasificaciones=613&filtroClasificaciones=373" +
    "&filtroClasificaciones=362&filtroClasificaciones=317&filtroClasificaciones=372" +
    "&filtroClasificaciones=363&filtroClasificaciones=367&filtroClasificaciones=364" +
    "&filtroClasificaciones=424&filtroClasificaciones=625&filtroClasificaciones=638" +
    "&filtroClasificaciones=278&filtroClasificaciones=620&filtroClasificaciones=368" +
    "&filtroClasificaciones=307&filtroClasificaciones=309&filtroClasificaciones=365" +
    "&filtroClasificaciones=421&filtroClasificaciones=355&filtroClasificaciones=369" +
    "&filtroClasificaciones=370&filtroClasificaciones=366&filtroClasificaciones=633" +
    "&filtroClasificaciones=691&filtroClasificaciones=331&filtroClasificaciones=358" +
    "&filtroClasificaciones=648&filtroClasificaciones=325&filtroClasificaciones=520" +
    "&filtroClasificaciones=360&filtroClasificaciones=343&filtroClasificaciones=354" +
    "&filtroClasificaciones=522&filtroClasificaciones=329&filtroClasificaciones=359" +
    "&filtroClasificaciones=692&filtroClasificaciones=324&filtroClasificaciones=523" +
    "&filtroClasificaciones=322&filtroClasificaciones=332&filtroClasificaciones=627" +
    "&filtroClasificaciones=632&filtroClasificaciones=313&filtroClasificaciones=276" +
    "&filtroClasificaciones=319&filtroClasificaciones=320&filtroClasificaciones=374" +
    "&filtroClasificaciones=321&filtroClasificaciones=323&filtroClasificaciones=316" +
    "&filtroClasificaciones=423&filtroClasificaciones=357&filtroClasificaciones=326" +
    "&filtroClasificaciones=327&filtroClasificaciones=422&filtroClasificaciones=328" +
    "&filtroClasificaciones=330&filtroClasificaciones=371&filtroClasificaciones=356" +
    "&filtroClasificaciones=314&filtroClasificaciones=639&filtroClasificaciones=629" +
    "&filtroClasificaciones=612&filtroClasificaciones=312&filtroClasificaciones=636" +
    "&filtroClasificaciones=631&filtroClasificaciones=614&filtroClasificaciones=341" +
    "&filtroClasificaciones=352&filtroClasificaciones=344&filtroClasificaciones=347" +
    "&filtroClasificaciones=349&filtroClasificaciones=351&filtroClasificaciones=339" +
    "&filtroClasificaciones=635&filtroClasificaciones=637" +
    "&filtroDireccion=15&filtroEstados=5&filtroArea=25&filtroArea=26&filtroArea=27&filtroArea=149";

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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login() {
    let cookies = {};
    const preLoginResp = await fetch(`${BASE}/login`, { method: "GET", redirect: "manual" });
    const setCookiePre = preLoginResp.headers.getSetCookie ? preLoginResp.headers.getSetCookie() : [];
    cookies = { ...cookies, ...parseCookies(setCookiePre) };

    const loginBody = new URLSearchParams({ username: USERNAME, password: PASSWORD, login: "" });
    const loginResp = await fetch(`${BASE}/j_security_check`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Cookie": cookieHeader(cookies) },
        body: loginBody.toString(),
        redirect: "manual",
    });

    const setCookieLogin = loginResp.headers.getSetCookie ? loginResp.headers.getSetCookie() : [];
    cookies = { ...cookies, ...parseCookies(setCookieLogin) };

    const location = loginResp.headers.get("location") || "";
    if (loginResp.status !== 302 || location.includes("error")) {
        throw new Error("Login fallido.");
    }
    console.log("Login OK.");
    return cookies;
}

async function obtenerPagina(cookies, pagina) {
    const url = `${BASE}/equipamiento?${QUERY_PARAMS}&d-5687999-p=${pagina}`;
    const resp = await fetch(url, {
        method: "GET",
        headers: { "Cookie": cookieHeader(cookies), "Referer": `${BASE}/equipamiento` },
    });
    if (!resp.ok) throw new Error(`Error en página ${pagina}: status ${resp.status}`);
    return await resp.text();
}

function extraerIDs(html) {
    const $ = cheerio.load(html);
    const ids = [];
    $("td.columna-id").each((i, el) => {
        const texto = $(el).text().trim();
        if (texto && /^\d+$/.test(texto)) ids.push(Number(texto));
    });
    return ids;
}

async function main() {
    console.log("=".repeat(60));
    console.log("  ESCANEO DE IDs DUPLICADOS");
    console.log("  (Lámparas, Columnas, Tableros, Transversales - En Servicio)");
    console.log("=".repeat(60));
    console.log("");

    const cookies = await login();

    // Primero obtenemos la página 1 para saber el total de páginas
    console.log("Obteniendo página 1 para calcular total de páginas...");
    const htmlPagina1 = await obtenerPagina(cookies, 1);
    const $ = cheerio.load(htmlPagina1);

    // Extraer el número total de páginas del paginador
    const ultimoLink = $(".paginador a[title*='última']").attr("href") || "";
    const matchUltima = ultimoLink.match(/d-5687999-p=(\d+)/);
    const totalPaginas = matchUltima ? parseInt(matchUltima[1]) : 6909;

    // También extraer el total de equipamientos
    const titular = $(".titular").text() || "";
    const matchTotal = titular.match(/Equipamientos encontrados:\s*<b>([\d,.]+)<\/b>/) || titular.match(/Equipamientos encontrados:\s*\*?\*?([\d,.]+)/);
    const totalEquipamientos = matchTotal ? matchTotal[1] : "desconocido";

    console.log(`Total de equipamientos: ${totalEquipamientos}`);
    console.log(`Total de páginas: ${totalPaginas}`);
    console.log(`Tiempo estimado: ~${Math.ceil(totalPaginas * 1.2 / 60)} minutos`);
    console.log("");

    // Procesar página 1 (ya la tenemos)
    let todosLosIDs = extraerIDs(htmlPagina1);
    let paginasProcesadas = 1;
    console.log(`[1/${totalPaginas}] Página 1: ${todosLosIDs.length} IDs extraídos (total acumulado: ${todosLosIDs.length})`);

    // Procesar páginas 2 en adelante
    for (let pagina = 2786; pagina <= totalPaginas; pagina++) {
        try {
            const html = await obtenerPagina(cookies, pagina);
            const ids = extraerIDs(html);
            todosLosIDs = todosLosIDs.concat(ids);
            paginasProcesadas++;

            // Mostrar progreso cada página, pero sin saltar línea (más limpio)
            process.stdout.write(`\r[${pagina}/${totalPaginas}] Pág ${pagina}: ${ids.length} IDs | Total acumulado: ${todosLosIDs.length}   `);
            if (pagina === totalPaginas) console.log(""); // salto de línea al final

            await sleep(800); // pausa para no saturar
        } catch (err) {
            console.log(`ERROR en página ${pagina}: ${err.message}. Reintentando...`);
            await sleep(2000);
            pagina--; // reintentar
        }
    }

    console.log("");
    console.log("=".repeat(60));
    console.log("  RESULTADOS");
    console.log("=".repeat(60));
    console.log(`Total de páginas procesadas: ${paginasProcesadas}`);
    console.log(`Total de IDs recolectados: ${todosLosIDs.length}`);
    console.log("");

    // Encontrar duplicados
    const conteo = {};
    for (const id of todosLosIDs) {
        conteo[id] = (conteo[id] || 0) + 1;
    }

    const duplicados = Object.entries(conteo)
        .filter(([id, cantidad]) => cantidad > 1)
        .map(([id, cantidad]) => ({ id: Number(id), cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad);

    if (duplicados.length === 0) {
        console.log("✅ No se encontraron IDs duplicados.");
    } else {
        console.log(`⚠ Se encontraron ${duplicados.length} IDs duplicados:`);
        console.log("");
        console.log("ID\t\t\tVeces\t\tTipo (si está disponible)");
        console.log("-".repeat(60));
        for (const dup of duplicados) {
            console.log(`${dup.id}\t\t${dup.cantidad}`);
        }
    }
}

main().catch((err) => {
    console.error("\nError:", err.message);
    process.exit(1);
});