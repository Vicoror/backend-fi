// lib/estados.ts
export const estadosMexicanos = [
  { value: 'AGUASCALIENTES', label: 'Aguascalientes' },
  { value: 'BAJA_CALIFORNIA', label: 'Baja California' },
  { value: 'BAJA_CALIFORNIA_SUR', label: 'Baja California Sur' },
  { value: 'CAMPECHE', label: 'Campeche' },
  { value: 'CHIAPAS', label: 'Chiapas' },
  { value: 'CHIHUAHUA', label: 'Chihuahua' },
  { value: 'CIUDAD_DE_MEXICO', label: 'Ciudad de México' },
  { value: 'COAHUILA', label: 'Coahuila' },
  { value: 'COLIMA', label: 'Colima' },
  { value: 'DURANGO', label: 'Durango' },
  { value: 'ESTADO_DE_MEXICO', label: 'Estado de México' },
  { value: 'GUANAJUATO', label: 'Guanajuato' },
  { value: 'GUERRERO', label: 'Guerrero' },
  { value: 'HIDALGO', label: 'Hidalgo' },
  { value: 'JALISCO', label: 'Jalisco' },
  { value: 'MICHOACAN', label: 'Michoacán' },
  { value: 'MORELOS', label: 'Morelos' },
  { value: 'NAYARIT', label: 'Nayarit' },
  { value: 'NUEVO_LEON', label: 'Nuevo León' },
  { value: 'OAXACA', label: 'Oaxaca' },
  { value: 'PUEBLA', label: 'Puebla' },
  { value: 'QUERETARO', label: 'Querétaro' },
  { value: 'QUINTANA_ROO', label: 'Quintana Roo' },
  { value: 'SAN_LUIS_POTOSI', label: 'San Luis Potosí' },
  { value: 'SINALOA', label: 'Sinaloa' },
  { value: 'SONORA', label: 'Sonora' },
  { value: 'TABASCO', label: 'Tabasco' },
  { value: 'TAMAULIPAS', label: 'Tamaulipas' },
  { value: 'TLAXCALA', label: 'Tlaxcala' },
  { value: 'VERACRUZ', label: 'Veracruz' },
  { value: 'YUCATAN', label: 'Yucatán' },
  { value: 'ZACATECAS', label: 'Zacatecas' },
];

// Helper para obtener label
export function getEstadoLabel(value: string): string {
  const estado = estadosMexicanos.find(e => e.value === value);
  return estado?.label || value;
}