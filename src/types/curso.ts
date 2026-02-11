// server/src/types/curso.ts
export type Curso = {
  id: string
  nivel: string
  subnivel: string
  dias: string
  horario: string
  duracion: string
  cupoMaximo: number
  precio: number
  inicio: string
  fin: string
  activo: boolean
}
// Datos para crear curso (POST)
export type CursoInput = Omit<Curso, "id">
