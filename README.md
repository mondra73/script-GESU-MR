# Automatizaciones GESU (Alumbrado Público - Rosario)

Scripts en Node.js para automatizar tareas repetitivas en la plataforma GESU
(`https://www.rosario.gob.ar/gesu-webapp`), evitando hacerlas a mano una por
una desde el navegador.

## Requisitos

- Node.js 18 o superior (`node --version` para chequear).
- La librería `cheerio`, instalada una sola vez en la carpeta del proyecto:
  ```bash
  npm install cheerio
  ```

## Usuario y contraseña

Cada script tiene su usuario y contraseña de GESU escritos directamente en
el código (constantes `USERNAME` / `PASSWORD` al principio del archivo).

⚠️ **Revisar que cada script tenga cargada la cuenta correcta antes de
correrlo.** Actualmente:

| Script | Usuario configurado |
|---|---|
| `export_zonas.js` | `jespino2` |
| `encontrar_duplicados.js` | `jespino2` |
| `actualizar_ubicaciones.js` | `cmaldon0` |
| `dar_baja_equipamientos.js` | `rsalvia0` |

Si alguno de estos usuarios no es el que corresponde (por ejemplo, si se
copió una plantilla sin actualizar el usuario), corregirlo en el código
antes de ejecutar — cada acción en GESU queda registrada bajo la cuenta que
inicia sesión.

---

## 1. `export_zonas.js` — Exportar CSV de equipamientos por zona

### Qué hace

Reemplaza el proceso manual de: entrar a GESU → elegir Zona 1/2/3 → ir a
"Registro de equipamientos" → filtrar por Estado = "En Servicio" y Tipo =
"Lámpara" → descargar el CSV. El script hace esto automáticamente para las
**3 zonas en una sola corrida**.

### Cómo usarlo

```bash
node export_zonas.js
```

### Qué genera

Tres archivos CSV en la misma carpeta: `zona1.csv`, `zona2.csv`, `zona3.csv`,
cada uno con el listado completo de lámparas "En Servicio" de esa zona.

### Cosas para tener en cuenta

- Tarda unos segundos por zona (hay pausas incluidas a propósito para no
  saturar el servidor).
- Si cambian los filtros disponibles en la plataforma, puede ser necesario
  actualizar la lista `FILTRO_CLASIFICACIONES` dentro del script.

---

## 2. `actualizar_ubicaciones.js` — Re-actualizar ubicación de lámparas (fix del mapa)

### Qué hace

Soluciona el problema conocido de GESU donde, después de una edición masiva,
algunas lámparas dejan de verse en el mapa (aunque sí aparecen en el listado
de equipamientos). Manualmente, esto se arregla entrando al detalle de cada
lámpara y tocando el botón "Actualizar ubicación", una por una. El script
automatiza ese proceso para una lista de IDs.

Por cada ID, el script:

1. Selecciona automáticamente la zona correcta (prueba Zona 1, 2 y 3 hasta
   encontrar el equipamiento).
2. Trae el formulario de detalle de esa lámpara.
3. Reenvía el formulario tal cual está, simulando el click en "Actualizar
   ubicación".

### Cómo usarlo

La lista de IDs se pasa por variable de entorno en un archivo `.env` en la
misma carpeta del script:

```
IDS_ACTUALIZAR_UBICACIONES=216425,216424,216423
```

Después:

```bash
node actualizar_ubicaciones.js
```

### Qué muestra en pantalla

Progreso por ID con tiempo restante estimado, y un resumen final:

```
[1/3] id=216425 (~1 min rest) ... OK
[2/3] id=216424 (~1 min rest) ... OK
[3/3] id=216423 (~0 min rest) ... OK

== Resumen ==
Actualizados OK (3): [ 216425, 216424, 216423 ]
```

Si algún ID falla, no corta el proceso — sigue con los demás y al final lista
cuáles fallaron y por qué.

### Cómo confirmar que funcionó

El script solo confirma que el servidor aceptó el reenvío del formulario.
Para confirmar que el problema del mapa se solucionó, hay que entrar a la
plataforma, buscar, y verificar **visualmente** que esas lámparas vuelven a
aparecer en el mapa.

### Importante: solo lámparas

Pensado y probado únicamente para equipamientos de tipo **Lámpara**. No usar
con columnas, tableros o transversales sin antes revisar/adaptar el parser
del formulario, ya que esos tipos pueden tener campos distintos.

### Cosas para tener en cuenta

- Pausa de 1.5 segundos entre cada ID. Con listas grandes el proceso puede
  tardar varios minutos — es normal, no interrumpirlo.
- Si la plataforma cambia la estructura del formulario, el script podría
  dejar de funcionar y habría que revisarlo.

---

## 3. `dar_baja_equipamientos.js` — Baja masiva de equipamientos por ID

### Qué hace

Reemplaza el proceso manual de dar de baja equipamientos uno por uno desde
`https://www.rosario.gob.ar/gesu-webapp/equipamiento/bajaequipamiento`
(buscar por ID, tildar el checkbox, confirmar la baja en el modal). El
script recorre una lista de IDs y da de baja cada uno automáticamente, con
la fecha del día.

**Antes de dar de baja cualquier ID, el script verifica que no haya más de
un registro con ese mismo ID** (bug conocido de la plataforma). Si encuentra
un ID duplicado, **no lo elimina** y lo reporta por consola para que se
revise manualmente buscándolo en la plataforma.

### Cómo usarlo

Lista de IDs por `.env`:

```
IDS_BAJA_EQUIPAMIENTOS=494376,494377,494378
```

Después:

```bash
node dar_baja_equipamientos.js
```

### Qué muestra en pantalla

Un resumen final categorizado en 4 grupos:

- ✅ **Dados de baja**: se eliminaron correctamente.
- ⚠️ **Duplicados**: encontrados más de una vez con el mismo ID — no se
  tocaron, hay que revisarlos a mano.
- ❓ **No encontrados**: el ID no existe en la plataforma.
- ❌ **Con error**: falló la búsqueda o la baja por algún otro motivo.

```
✅ Dados de baja (48):
   494376, 494377, ...
⚠ Duplicados - NO eliminados (1):
   id=494380: 2 registros duplicados
❓ No encontrados (1):
   494999
```

### Importante: actualmente solo probado con Lámparas

Igual que en el punto anterior, la lógica de baja fue capturada y probada
con un equipamiento de tipo Lámpara. Antes de usarlo con Columnas o
Transversales, conviene repetir el proceso de verificación (capturar el
`Copy as cURL` de una baja real de ese tipo) para confirmar que el request
es idéntico. Si el comportamiento es el mismo para los 3 tipos, no haría
falta ningún cambio; si difiere, avisar para ajustar el script.

### Cosas para tener en cuenta

- Pausa de 1 segundo entre cada ID.
- Esta acción **no tiene vuelta atrás** en la plataforma (dar de baja es
  definitivo) — revisar bien la lista de IDs antes de correr el script.

---

## 4. `encontrar_duplicados.js` — Escaneo general de IDs duplicados

### Qué hace

Recorre **todo** el listado de equipamientos "En Servicio" de la plataforma
(lámparas, columnas, tableros y transversales, las 3 zonas + Ascensores),
página por página, y arma un reporte de qué IDs aparecen más de una vez.

Sirve como diagnóstico previo: por ejemplo, antes de correr una baja masiva,
para saber de antemano cuáles de los IDs que se quieren dar de baja están
duplicados y van a necesitar revisión manual.

### Cómo usarlo

```bash
node encontrar_duplicados.js
```

No necesita `.env` ni lista de IDs — escanea todo.

### Qué muestra en pantalla

Progreso página por página (recorre miles de páginas, así que tarda
bastante — el script estima el tiempo al arrancar) y al final la lista de
IDs duplicados con cuántas veces aparece cada uno:

```
Total de equipamientos: 172,650
Total de páginas: 6909
Tiempo estimado: ~138 minutos
...
⚠ Se encontraron 12 IDs duplicados:
ID          Veces
494380      2
501122      3
```

### Cosas para tener en cuenta

- **Es lento** (recorre todas las páginas del sistema, ~6900 páginas con los
  filtros actuales) — pensarlo como una tarea para dejar corriendo en
  segundo plano, no para esperar en el momento.
- Si falla en alguna página (error de red, timeout), reintenta esa misma
  página automáticamente antes de continuar.
- Los filtros de tipo/clasificación/zona que usa están fijos en
  `QUERY_PARAMS` dentro del script — si la plataforma agrega categorías
  nuevas, puede necesitar actualizarse.

---

## 5. `convertir_ids.js` — Formatear una lista de IDs para pegar en el `.env`

### Qué hace

Herramienta auxiliar, no habla con GESU. Sirve para cuando se copian IDs
desde una planilla de Excel (una columna con un ID por fila, a veces con un
encabezado tipo "ID") y hay que convertirlos al formato de una sola línea
separado por comas que esperan los `.env` de `actualizar_ubicaciones.js` y
`dar_baja_equipamientos.js`.

### Cómo usarlo

1. Pegar los IDs copiados del Excel (uno por línea) en un archivo llamado
   `.env-entrada`, en la misma carpeta del script.
2. Correr:
   ```bash
   node convertir_ids.js
   ```
3. El script imprime en pantalla la línea ya lista para copiar y pegar en
   el `.env` correspondiente:
   ```
   Total IDs: 50
   Primeros 3: [ 216425, 216424, 216423 ]

   IDS_ACTUALIZAR_UBICACIONES=216425,216424,216423,...
   ```
4. Copiar esa última línea (`IDS_ACTUALIZAR_UBICACIONES=...` o renombrarla a
   `IDS_BAJA_EQUIPAMIENTOS=...` según cuál se vaya a usar) y pegarla en el
   `.env` del script que corresponda.

### Cosas para tener en cuenta

- Ignora líneas vacías y encabezados tipo "ID".
- Solo toma líneas que sean puramente numéricas — si el Excel trae texto
  extra pegado al ID, hay que limpiarlo antes.

---

## Sistema de configuración por `.env`

`actualizar_ubicaciones.js` y `dar_baja_equipamientos.js` leen la lista de
IDs a procesar desde un archivo `.env` en la misma carpeta (no está incluido
en el repositorio/carpeta compartida — hay que crearlo a mano cada vez).

Formato del `.env`:

```
IDS_ACTUALIZAR_UBICACIONES=216425,216424,216423
IDS_BAJA_EQUIPAMIENTOS=494376,494377,494378
```

Se puede tener un único `.env` con ambas variables, o archivos separados —
cada script solo lee la variable que le corresponde e ignora el resto.

`convertir_ids.js` usa un archivo distinto, `.env-entrada`, pensado para
pegar ahí los IDs "crudos" copiados de Excel antes de formatearlos.

---

## Notas generales para todos los scripts

- **No corren solos**: hay que ejecutarlos manualmente desde la terminal
  cada vez que se necesiten (`node nombre_del_script.js`).
- **Requieren conexión a internet** y que la cuenta de GESU usada en cada
  uno tenga sesión válida (usuario/contraseña correctos y vigentes).
- Si alguna contraseña cambia, hay que actualizarla en la constante
  `PASSWORD` del script correspondiente.
- Por seguridad, sería recomendable en algún momento sacar usuario y
  contraseña del código y pedirlos también por `.env` (como ya se hace con
  los IDs) en vez de tenerlos escritos directamente en cada archivo —
  queda pendiente como mejora futura.
- Ninguno de estos scripts fue provisto ni validado por la Municipalidad —
  son automatizaciones caseras sobre una plataforma existente. Cualquier
  cambio que haga la plataforma en sus formularios o endpoints puede
  romperlos, y conviene revisar los resultados de tandas grandes (sobre
  todo bajas, que son irreversibles) antes de darlas por hechas.
