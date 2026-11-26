// ============================================================================
// Vincimia Agenda — Script sincronizador para Google Sheets (promotores)
// Fuente: Documento Maestro de Proyecto — Vincimia (pág. 6-7), adaptado.
// ----------------------------------------------------------------------------
// CÓMO INSTALARLO (2 minutos):
//   1. Abre tu hoja de cálculo de promotores en Google Sheets.
//   2. Extensiones → Apps Script. Borra lo que haya y pega TODO este archivo.
//   3. Cambia las 3 constantes de abajo (URL, secreto y organization_id).
//      El secreto está en Supabase → organizations → excel_webhook_secret
//      de tu negocio. NUNCA lo compartas por WhatsApp ni lo pegues en el chat.
//   4. Guarda (Ctrl+S) y vuelve a la hoja.
//   5. Escribe una fila nueva: A Fecha | B Hora | C Cliente | D Teléfono |
//      E Promotor | F Estado (se llena solo).
// Columnas: A=Fecha, B=Hora, C=Cliente, D=Teléfono, E=Promotor, F=Estado.
// Si la fila choca con una cita existente, la columna F dirá "⚠️ Conflicto"
// en rojo y la cita quedará registrada como conflicto en Vincimia Agenda.
// Si está libre, dirá "🟢 Confirmado" y la cita nace en pendiente.
//
// DIRECCIÓN INVERSA (Agenda → hoja): es otro script, en otro proyecto
// de Apps Script, pegado en la misma hoja:
// scripts/apps-script-agenda-a-sheets.gs. Este archivo no se toca
// para eso; solo se deja esta nota para no confundir las dos direcciones.
// ============================================================================

// --- CAMBIA ESTAS 3 LÍNEAS ---------------------------------------------------
var SUPABASE_WEBHOOK_URL = "https://TU-PROYECTO.pages.dev/api/webhook/sheets";
// Si usas la Edge Function de Supabase en lugar de la ruta Next.js, usa:
// "https://TU-REF.supabase.co/functions/v1/sync-excel-promoter"
var API_SECRET_KEY = "TU_EXCEL_WEBHOOK_SECRET_AQUI";
var ORGANIZATION_ID = "11111111-1111-1111-1111-111111111111";
// -----------------------------------------------------------------------------

function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  var row = e.range.getRow();
  if (row === 1) return; // Ignorar encabezados

  // Columnas: A=Fecha, B=Hora, C=Cliente, D=Teléfono, E=Promotor, F=Estado
  var fecha = sheet.getRange(row, 1).getValue();
  var hora = sheet.getRange(row, 2).getValue();
  var cliente = sheet.getRange(row, 3).getValue();
  var telefono = sheet.getRange(row, 4).getValue();
  var promotor = sheet.getRange(row, 5).getValue();

  if (!fecha || !hora || !cliente) return;

  var payload = {
    organization_id: ORGANIZATION_ID,
    promoter_name: promotor || "Externo",
    client_name: cliente,
    client_phone: telefono || "",
    start_time: formatDateTime(fecha, hora),
    service_name: "Consulta General",
    source: "excel_promoter"
  };

  var options = {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + API_SECRET_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(SUPABASE_WEBHOOK_URL, options);
    var result = JSON.parse(response.getContentText());

    if (result.success) {
      sheet.getRange(row, 6).setValue("🟢 Confirmado");
      sheet.getRange(row, 6).setBackground("#d1fae5");
    } else if (result.status === "conflict") {
      sheet.getRange(row, 6).setValue("⚠️ Conflicto: " + result.message);
      sheet.getRange(row, 6).setBackground("#fee2e2");
    } else {
      sheet.getRange(row, 6).setValue("❌ Error: " + result.message);
      sheet.getRange(row, 6).setBackground("#fef08a");
    }
  } catch (error) {
    sheet.getRange(row, 6).setValue("❌ Error de conexión");
    sheet.getRange(row, 6).setBackground("#fef08a");
  }
}

function formatDateTime(fecha, hora) {
  var d = new Date(fecha);
  var year = d.getFullYear();
  var month = ("0" + (d.getMonth() + 1)).slice(-2);
  var day = ("0" + d.getDate()).slice(-2);
  var timeStr = hora instanceof Date
    ? ("0" + hora.getHours()).slice(-2) + ":" + ("0" + hora.getMinutes()).slice(-2)
    : hora.toString();
  return year + "-" + month + "-" + day + "T" + timeStr + ":00";
}
