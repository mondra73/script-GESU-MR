# Automatizaciones GESU (Alumbrado Público - Rosario)

Scripts en Node.js para automatizar tareas repetitivas en la plataforma GESU
(`https://www.rosario.gob.ar/gesu-webapp`), evitando hacerlas a mano una por una
desde el navegador.

## Requisitos

- Node.js 18 o superior (`node --version` para chequear).
- Para `actualizar_ubicaciones.js`, la librería `cheerio` instalada una sola vez:
  ```bash
  npm install cheerio
  ```

Ambos scripts tienen el usuario y la contraseña de GESU escritos directamente
en el código (`USERNAME` / `PASSWORD` al principio del archivo). Si la
contraseña cambia, hay que actualizarla ahí.

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

Tres archivos CSV en la misma carpeta:

- `zona1.csv`
- `zona2.csv`
- `zona3.csv`

Cada uno contiene el listado completo de lámparas "En Servicio" de esa zona,
con las mismas columnas que exporta la plataforma manualmente (Nº de serie,
Ubicación, Tipo, Clasificación, Responsable, Estado, ID, etc.).

### Cosas para tener en cuenta

- Tarda unos segundos por zona (hay pausas incluidas a propósito para no
  saturar el servidor).
- Si algún día cambian los filtros disponibles en la plataforma (por ejemplo
  agregan una clasificación nueva), puede ser necesario actualizar la lista
  `FILTRO_CLASIFICACIONES` dentro del script.

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
   encontrar el equipamiento — no hace falta saber de antemano en qué zona
   está cada lámpara).
2. Trae el formulario de detalle de esa lámpara.
3. Reenvía el formulario tal cual está, simulando el click en "Actualizar
   ubicación" (esto es lo que dispara que la plataforma la vuelva a mostrar
   en el mapa).

### Cómo usarlo

1. Abrir `actualizar_ubicaciones.js` con un editor de texto.
2. Cargar los IDs a procesar en la lista `IDS`, cerca del principio del
   archivo:
   ```javascript
   const IDS = [
     216425,
     216424,
     216423,
     // ... agregar los que hagan falta, separados por coma
   ];
   ```
3. Guardar el archivo y correr:
   ```bash
   node actualizar_ubicaciones.js
   ```

### Qué muestra en pantalla

Un resumen al final, indicando qué IDs se actualizaron bien y cuáles
tuvieron algún error:

```
== Resumen ==
Actualizados OK (3): [ 216425, 216424, 216423 ]
```

Si algún ID falla, no corta el proceso — sigue con los demás y al final lista
cuáles fallaron y por qué, para poder reintentarlos.

### Cómo confirmar que funcionó

El script solo confirma que el servidor aceptó el reenvío del formulario.
Para confirmar que el problema del mapa realmente se solucionó, hay que
entrar a la plataforma, hacer la búsqueda correspondiente, y verificar
**visualmente** que esas lámparas vuelven a aparecer en el mapa.

### Importante: solo lámparas

Este proceso está pensado y probado únicamente para equipamientos de tipo
**Lámpara**. No usar con columnas, tableros o transversales — el formulario
de esos tipos de equipamiento puede tener campos distintos y el script no
fue probado con ellos.

### Cosas para tener en cuenta

- Hay una pausa de 1.5 segundos entre cada ID para no saturar el servidor.
  Con listas grandes (50+ IDs), el proceso puede tardar varios minutos —
  es normal, no hay que interrumpirlo.
- Si la plataforma llegara a cambiar la estructura del formulario de
  equipamiento (nuevos campos, nombres distintos), el script podría dejar
  de funcionar correctamente y habría que revisarlo de nuevo.

---

## Notas generales para ambos scripts

- **No corren solos**: hay que ejecutarlos manualmente desde la terminal
  cada vez que se necesiten (`node nombre_del_script.js`).
- **Requieren conexión a internet** y que la cuenta de GESU (`jespino2`)
  tenga sesión válida (usuario/contraseña correctos).
- Si la contraseña de la cuenta cambia en el futuro, hay que actualizarla en
  la constante `PASSWORD` de **ambos** archivos.
- Por seguridad, sería recomendable en algún momento sacar la contraseña del
  código y pedirla como variable de entorno en vez de tenerla escrita en el
  archivo — quedó pendiente como mejora futura.
