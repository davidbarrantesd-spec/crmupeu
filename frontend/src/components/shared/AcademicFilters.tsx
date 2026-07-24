import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAcademicCatalogs, modalityLabel, enrollmentLabel } from '@/hooks/useAcademicCatalogs'
import { segmentLabel } from '@/components/shared/SegmentBadge'

const ANY = '__any__'

export interface AcademicFilterValues {
  campus_id?: string
  faculty_id?: string
  career_id?: string
  academic_level_id?: string
  modality?: string
  enrollment_status?: string
  payment_segment?: string
  academic_period?: string
}

export type AcademicFilterKey = keyof AcademicFilterValues

interface AcademicFiltersProps {
  value: AcademicFilterValues
  onChange: (value: AcademicFilterValues) => void
  /** Qué filtros mostrar y en qué orden. */
  fields: AcademicFilterKey[]
  className?: string
}

/** Convierte los valores del filtro a parámetros de la API ('' → undefined). */
export function academicFilterParams(value: AcademicFilterValues): Record<string, string | undefined> {
  return {
    campus_id: value.campus_id || undefined,
    faculty_id: value.faculty_id || undefined,
    career_id: value.career_id || undefined,
    academic_level_id: value.academic_level_id || undefined,
    modality: value.modality || undefined,
    enrollment_status: value.enrollment_status || undefined,
    payment_segment: value.payment_segment || undefined,
    academic_period: value.academic_period || undefined,
  }
}

export function hasAcademicFilters(value: AcademicFilterValues): boolean {
  return Object.values(value).some(Boolean)
}

/**
 * Grupo de selects de filtros académicos (campus / facultad / carrera en cascada,
 * nivel, modalidad, segmento de pago, estado de matrícula, periodo).
 */
export function AcademicFilters({ value, onChange, fields }: AcademicFiltersProps) {
  const { catalogs, careersForFaculty } = useAcademicCatalogs()

  const set = (key: AcademicFilterKey, v: string) => {
    const next: AcademicFilterValues = { ...value, [key]: v === ANY ? '' : v }
    // Cascada: cambiar facultad limpia la carrera si ya no corresponde
    if (key === 'faculty_id') {
      const facultyId = next.faculty_id
      if (next.career_id) {
        const stillValid = careersForFaculty(facultyId).some((c) => String(c.id) === next.career_id)
        if (!stillValid) next.career_id = ''
      }
    }
    onChange(next)
  }

  const careers = careersForFaculty(value.faculty_id)

  const renderers: Record<AcademicFilterKey, () => React.ReactNode> = {
    campus_id: () => (
      <Select key="campus" value={value.campus_id || ANY} onValueChange={(v) => set('campus_id', v)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Campus" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Todos los campus</SelectItem>
          {catalogs.campuses.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
    faculty_id: () => (
      <Select key="faculty" value={value.faculty_id || ANY} onValueChange={(v) => set('faculty_id', v)}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Facultad" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Todas las facultades</SelectItem>
          {catalogs.faculties.map((f) => (
            <SelectItem key={f.id} value={String(f.id)}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
    career_id: () => (
      <Select key="career" value={value.career_id || ANY} onValueChange={(v) => set('career_id', v)}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Carrera" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Todas las carreras</SelectItem>
          {careers.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
    academic_level_id: () => (
      <Select key="level" value={value.academic_level_id || ANY} onValueChange={(v) => set('academic_level_id', v)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Nivel" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Todos los niveles</SelectItem>
          {catalogs.levels.map((l) => (
            <SelectItem key={l.id} value={String(l.id)}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
    modality: () => (
      <Select key="modality" value={value.modality || ANY} onValueChange={(v) => set('modality', v)}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Modalidad" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Toda modalidad</SelectItem>
          {catalogs.modalities.map((m) => (
            <SelectItem key={m} value={m}>
              {modalityLabel(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
    payment_segment: () => (
      <Select key="segment" value={value.payment_segment || ANY} onValueChange={(v) => set('payment_segment', v)}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Segmento de pago" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Todos los segmentos</SelectItem>
          {catalogs.segments.map((s) => (
            <SelectItem key={s.key} value={s.key}>
              {s.label || segmentLabel(s.key)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
    enrollment_status: () => (
      <Select key="enrollment" value={value.enrollment_status || ANY} onValueChange={(v) => set('enrollment_status', v)}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Matrícula" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Toda matrícula</SelectItem>
          <SelectItem value="matriculado">{enrollmentLabel('matriculado')}</SelectItem>
          <SelectItem value="no_matriculado">{enrollmentLabel('no_matriculado')}</SelectItem>
        </SelectContent>
      </Select>
    ),
    academic_period: () => (
      <Select key="period" value={value.academic_period || ANY} onValueChange={(v) => set('academic_period', v)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Periodo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Todos los periodos</SelectItem>
          {catalogs.periods.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
  }

  return <>{fields.map((f) => renderers[f]())}</>
}
