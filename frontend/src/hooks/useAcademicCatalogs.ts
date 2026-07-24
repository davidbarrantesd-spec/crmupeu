import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { AcademicCatalogs, ApiResource, Career } from '@/types'

const EMPTY: AcademicCatalogs = {
  campuses: [],
  faculties: [],
  levels: [],
  modalities: [],
  periods: [],
  segments: [],
  behaviors: [],
}

/** Etiquetas legibles para las modalidades del catálogo. */
export function modalityLabel(modality: string | null | undefined): string {
  if (!modality) return '—'
  const map: Record<string, string> = {
    presencial: 'Presencial',
    semipresencial: 'Semipresencial',
    virtual: 'Virtual',
  }
  return map[modality] ?? modality.charAt(0).toUpperCase() + modality.slice(1)
}

/** Etiquetas para el estado de matrícula. */
export function enrollmentLabel(status: string | null | undefined): string {
  if (!status) return '—'
  const map: Record<string, string> = {
    matriculado: 'Matriculado',
    no_matriculado: 'No matriculado',
  }
  return map[status] ?? status.replace(/_/g, ' ')
}

/** Catálogos académicos compartidos (campus, facultades, carreras, niveles, periodos, segmentos). */
export function useAcademicCatalogs() {
  const query = useQuery({
    queryKey: ['catalogs', 'academic'],
    queryFn: async () => {
      const res = await api.get<ApiResource<AcademicCatalogs>>('/catalogs/academic')
      return res.data.data
    },
    staleTime: 1000 * 60 * 30, // 30 minutos: los catálogos cambian poco
    gcTime: 1000 * 60 * 60,
  })

  const catalogs = query.data ?? EMPTY
  const allCareers: Career[] = catalogs.faculties.flatMap((f) => f.careers ?? [])

  /** Carreras filtradas por facultad (todas si no se indica facultad). */
  const careersForFaculty = (facultyId?: number | string | null): Career[] => {
    if (!facultyId) return allCareers
    const id = Number(facultyId)
    return allCareers.filter((c) => c.faculty_id === id)
  }

  return { ...query, catalogs, allCareers, careersForFaculty }
}
