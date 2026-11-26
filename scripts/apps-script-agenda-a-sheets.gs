// ============================================================================
// Vincimia Agenda — Receptor Agenda → hoja de promotores (escritura inversa)
// Archivo oficial: AGENDA DE PROMOTORES 2026.xlsx
// ID: 1X5VFHwmrmH9_gtySF20nBL-XV7_V4Gzp
// Pestaña oficial: DENTIPLUS MEXICALI 1
// ----------------------------------------------------------------------------
// DIRECCIÓN: Agenda → hoja. Es lo contrario del script
// scripts/apps-script-sheets.gs (hoja → Agenda). Ese script NO se toca
// para esto; este archivo vive en un proyecto de Apps Script APARTE,
// pegado en la MISMA hoja (la original), en Extensiones → Apps Script.
// NO se prueba en la hoja original: primero en una COPIA convertida a
// Google Sheets, y solo si funciona se pega en la original.
//
// QUÉ HACE:
//   Una cita creada en Agenda (por el link público, por el bot de
//   WhatsApp o a mano en el panel) se escribe sola en la pestaña
//   DENTIPLUS MEXICALI 1, en el día y la hora que le tocan, para que
//   no se empalme con las citas que los promotores ya escribieron ahí.
//   - Busca el día por el día de la semana de la fecha de la cita
//     (la pestaña no trae fechas ni nombre de semana: es una plantilla
//     semanal que se reusa, así que el día sale de la fecha, no de un
//     rótulo).
//   - Busca la fila cuya columna A sea exactamente esa hora.
//   - Escribe el paciente en Paciente 1 (B) si está libre, si no en
//     Paciente 2 (E) si está libre. NUNCA sobrescribe una celda ocupada.
//   - Escribe la promoción/valoración en C o F, y la póliza en D o G.
//   - Si los dos lugares están ocupados, NO escribe nada y responde
//     success:false, status:"full".
//   - Si el día o la hora no existen en la pestaña, NO escribe nada y
//     responde success:false, status:"not_found".
//   - Cada intento (escrito, lleno o no encontrado) queda en la pestaña
//     AUDITORIA - DENTIPLUS MEXICALI, que se crea sola si no existe
//     y queda oculta.
//
// CÓMO INSTALARLO (lo hace el dueño, una vez):
//   1. Haz una COPIA de la hoja original y conviértela a Google Sheets
//      (Archivo → Guardar como hoja de cálculo de Google). La prueba
//      va en esa copia, nunca en la original.
//   2. En la copia: Extensiones → Apps Script. Pega TODO este archivo.
//   3. Cambia CONFIG.SECRET por una palabra secreta inventada (la
//      misma que luego va en Cloudflare como SHEETS_RECEIVER_SECRET).
//      NUNCA la compartas por WhatsApp ni la pegues en el chat.
//   4. Guarda (Ctrl+S) → Desplegar → Nueva implementación →
//      Aplicación web → Ejecutar como: Yo → Quién tiene acceso:
//      Cualquier persona. Copia la URL que termina en /exec.
//   5. Esa URL va en Cloudflare (proyecto vincimia-agenda, Production)
//      como SHEETS_RECEIVER_URL, y el secreto como
//      SHEETS_RECEIVER_SECRET. Luego Retry deployment.
//   6. Si la prueba funciona en la copia, repite los pasos 2-4 en la
//      hoja ORIGINAL y usa esa URL en Cloudflare.
//
// ESTRUCTURA DE LA PESTAÑA (verificada 2026-11-26 por lectura directa
// de la copia de prueba, filas exactas):
//   Lunes a sábado, sin domingo. A=hora, B-D Paciente 1 (rosa),
//   E-G Paciente 2 (verde). Horarios: 9:30, 10:00, 10:30, 11:00,
//   11:30, 12:00, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00.
//   La hora de las 11:00 SÍ existe en la hoja (fila 6 lunes, etc.).
//   Comida 13:00-14:00 (barra roja, sin cita). Bloques de filas
//   (solo horarios, fila de día + encabezado quedan fuera):
//   lunes 3-16, martes 20-33, miércoles 37-50, jueves 54-67,
//   viernes 71-84, sábado 88-101, sábado termina fila 102 CERRADO.
//   OJO: las celdas de hora son valores de HORA (Date), no texto:
//   en la barra de fórmulas se ven como "11:00:00 a. m.". Por eso
//   toMinutes() debe leerlas con la zona horaria de la hoja, no con
//   getHours() a secas (la zona del script puede mover la hora).
// ============================================================================

// --- CAMBIA ESTAS LÍNEAS -----------------------------------------------------
var CONFIG = {
  // Pestaña oficial de promotores de Dentiplus Mexicali.
  SHEET_NAME: "DENTIPLUS MEXICALI 1",
  // Pestaña de auditoría (se crea sola si no existe, queda OCULTA).
  AUDIT_SHEET_NAME: "AUDITORIA - DENTIPLUS MEXICALI",
  // Secreto compartido con Agenda (Cloudflare: SHEETS_RECEIVER_SECRET).
  // VACÍO = el receptor rechaza todo: hay que ponerlo antes de probar.
  SECRET: ""
};
// -----------------------------------------------------------------------------

// Bloques de filas por día de la semana (JS: 1=lunes … 6=sábado).
// Domingo (0) no existe en la pestaña.
var DAY_BLOCKS = {
  1: { first: 3, last: 16 },   // Lunes
  2: { first: 20, last: 33 },  // Martes
  3: { first: 37, last: 50 },  // Miércoles
  4: { first: 54, last: 67 },  // Jueves
  5: { first: 71, last: 84 },  // Viernes
  6: { first: 88, last: 101 }  // Sábado (fila 102 = CERRADO)
};

/** "10:00" → 600 minutos. Acepta "9:30", "10:00" y horas tipo Date.
 *  CAUSA RAÍZ encontrada 2026-11-26 (depuración v3): las celdas de
 *  hora NO llegan como instanceof Date en Apps Script — llegan como
 *  objeto "Sat Dec 30 1899 09:41:56 GMT-0748" (la hora se mueve 12
 *  minutos por la zona horaria de 1899), así que toMinutes() devolvía
 *  null para todas. La solución es NO usar getValues() para la hora:
 *  se usa getDisplayValues(), que devuelve el texto tal como se ve
 *  en la hoja ("9:30", "10:00", "11:00:00 a. m."), y eso sí se parsea.
 *  Este toMinutes además busca la hora en cualquier parte del texto,
 *  por si llega una cadena con fecha. */
function toMinutes(value) {
  if (value === null || value === undefined) return null;
  var s = String(value).trim();
  var m = s.match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  var h = parseInt(m[1], 10);
  var min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function isEmptyCell(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Crea la pestaña de auditoría con su encabezado, si no existe.
 *  Queda OCULTA (decisión de Salvador 2026-11-26): solo se ve en
 *  Ver > Hojas ocultas. Su nombre indica que es de Dentiplus Mexicali. */
function getAuditSheet(ss) {
  var audit = ss.getSheetByName(CONFIG.AUDIT_SHEET_NAME);
  if (!audit) {
    audit = ss.insertSheet(CONFIG.AUDIT_SHEET_NAME);
    audit.appendRow([
      "Fecha/hora recepción",
      "Paciente",
      "Fecha cita",
      "Hora",
      "Tratamiento",
      "Promotor/Origen",
      "Resultado",
      "Detalle"
    ]);
    audit.setFrozenRows(1);
  }
  try { audit.hideSheet(); } catch (e) {}
  return audit;
}

function logAudit(ss, payload, result, detail) {
  try {
    var audit = getAuditSheet(ss);
    audit.appendRow([
      new Date(),
      payload.patient_name || "",
      payload.start_date || "",
      payload.start_time || "",
      payload.service_name || payload.treatment || "",
      payload.promoter_name || payload.source || "",
      result,
      detail || ""
    ]);
  } catch (e) {
    // La auditoría nunca debe romper la escritura: si falla, se ignora.
  }
}

/** Salud del receptor: abrir la URL en el navegador debe decir ok:true. */
function doGet() {
  return json({
    ok: true,
    service: "vincimia-agenda-a-sheets",
    sheet: CONFIG.SHEET_NAME,
    configured: CONFIG.SECRET !== ""
  });
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var body = {};
  try {
    body = JSON.parse(e.postData.contents || "{}");
  } catch (err) {
    return json({ success: false, status: "bad_request", message: "JSON inválido." });
  }

  // 1. Secreto compartido. Sin secreto configurado, no se acepta nada.
  if (!CONFIG.SECRET || body.secret !== CONFIG.SECRET) {
    return json({ success: false, status: "unauthorized", message: "Secreto inválido o no configurado." });
  }

  var patientName = String(body.patient_name || "").trim();
  var startDate = String(body.start_date || "").trim(); // "2026-11-30"
  var startTime = String(body.start_time || "").trim(); // "10:00"
  var promotion = String(body.promotion || body.service_name || "VALORACIÓN").trim();
  // Sin póliza, la hoja usa PARTICULAR /SALVADOR (tipo de póliza + promotor).
  var policy = String(body.policy || "PARTICULAR /SALVADOR").trim().toUpperCase();
  if (!patientName || !startDate || !startTime) {
    logAudit(ss, body, "bad_request", "Faltan patient_name, start_date o start_time.");
    return json({ success: false, status: "bad_request", message: "Faltan patient_name, start_date o start_time." });
  }

  // 2. Día de la semana desde la FECHA (la pestaña no trae semana).
  //    Mediodía para que la zona horaria no mueva el día.
  var date = new Date(startDate + "T12:00:00");
  if (isNaN(date.getTime())) {
    logAudit(ss, body, "bad_request", "start_date inválida: " + startDate);
    return json({ success: false, status: "bad_request", message: "start_date inválida." });
  }
  var weekday = date.getDay(); // 0=domingo, 1=lunes … 6=sábado
  var block = DAY_BLOCKS[weekday];
  if (!block) {
    logAudit(ss, body, "not_found", "Domingo: no hay agenda en la pestaña.");
    return json({ success: false, status: "not_found", message: "No hay agenda ese día (domingo)." });
  }

  var targetMinutes = toMinutes(startTime);
  if (targetMinutes === null) {
    logAudit(ss, body, "bad_request", "start_time inválido: " + startTime);
    return json({ success: false, status: "bad_request", message: "start_time inválido." });
  }

  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    logAudit(ss, body, "not_found", "No existe la pestaña " + CONFIG.SHEET_NAME);
    return json({ success: false, status: "not_found", message: "No existe la pestaña " + CONFIG.SHEET_NAME });
  }

  // 3. Buscar la fila de esa hora dentro del bloque del día.
  //    La comida (13:00-14:00) y CERRADO no son horas de cita: no coinciden.
  // getDisplayValues, no getValues: las horas son objetos Date de 1899
  // que Apps Script no reconoce como Date y mueven la hora 12 minutos.
  // El texto visible ("9:30", "10:00") es el que se compara.
  var hours = sheet.getRange(block.first, 1, block.last - block.first + 1, 1).getDisplayValues();
  var row = null;
  for (var i = 0; i < hours.length; i++) {
    if (toMinutes(hours[i][0]) === targetMinutes) {
      row = block.first + i;
      break;
    }
  }
  if (!row) {
    // Depuración temporal: deja en auditoría qué vio el receptor.
    var debugHours = [];
    for (var j = 0; j < hours.length; j++) {
      var hv = hours[j][0];
      debugHours.push("fila " + (block.first + j) + ": tipo=" + (hv instanceof Date ? "Date" : typeof hv) + " valor=" + String(hv) + " min=" + toMinutes(hv));
    }
    logAudit(ss, body, "not_found", "Hora " + startTime + " no existe ese día. Bloque " + block.first + "-" + block.last + ", día semana=" + weekday + ". Visto: " + debugHours.join(" | "));
    return json({ success: false, status: "not_found", message: "Esa hora no existe en la agenda de ese día." });
  }

  // 4. Paciente 1 si está libre, si no Paciente 2. Nunca sobrescribir.
  var name1 = sheet.getRange(row, 2).getValue();
  var name2 = sheet.getRange(row, 5).getValue();
  var slot = null;
  if (isEmptyCell(name1)) {
    slot = 1;
    sheet.getRange(row, 2).setValue(patientName); // B NOMBRE PACIENTE 1
    sheet.getRange(row, 3).setValue(promotion);   // C PROMOCION O VAL
    sheet.getRange(row, 4).setValue(policy);      // D POLIZA O SIN POLIZA
  } else if (isEmptyCell(name2)) {
    slot = 2;
    sheet.getRange(row, 5).setValue(patientName); // E NOMBRE PACIENTE 2
    sheet.getRange(row, 6).setValue(promotion);   // F PROMOCION O VAL
    sheet.getRange(row, 7).setValue(policy);      // G POLIZA O SIN POLIZA
  } else {
    logAudit(ss, body, "full", "Fila " + row + ": Paciente 1 y Paciente 2 ya ocupados.");
    return json({
      success: false,
      status: "full",
      message: "Ese horario ya tiene los dos pacientes ocupados.",
      row: row,
      patient: patientName
    });
  }

  var detail = "Escrito en fila " + row + ", Paciente " + slot + ".";
  logAudit(ss, body, "written", detail);
  return json({
    success: true,
    status: "written",
    message: detail,
    row: row,
    slot: slot,
    patient: patientName,
    start_date: startDate,
    start_time: startTime
  });
}
