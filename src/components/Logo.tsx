// Logo oficial de Vincimia Agenda (V morada/azul con red de puntos).
// Logo oficial en /public/logo.svg: el PNG recortado del logo original
// que mandó Salvador, incrustado en base64 (el conector de GitHub solo
// sube archivos de texto, así el logo viaja como texto). Se muestra con
// esquinas redondeadas; el fondo claro de la imagen se funde con los
// encabezados blancos. Los PNG 192/512 están también en /public
// (icon-192.png, icon-512.png) para subirlos al repo por el navegador
// y ponerlos en el manifiesto.
export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <img
      src="/logo.svg"
      alt="Logo de Vincimia Agenda"
      className={`rounded-lg object-cover ${className}`}
    />
  );
}
