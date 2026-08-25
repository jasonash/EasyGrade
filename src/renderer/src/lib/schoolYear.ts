import type { Section } from '@shared/types'
import { useSectionsStore } from '@/stores/sections.store'
import { useSettingsStore } from '@/stores/settings.store'

/** Sentinel stored in settings.schoolYearFilter meaning "show every year". */
export const ALL_YEARS = ''

/**
 * Resolve the stored filter against the years that actually exist.
 * null (never chosen) means the newest year; '' means all years; an unknown
 * year falls back to the newest one.
 */
export function effectiveSchoolYear(filter: string | null, years: string[]): string {
  if (filter === ALL_YEARS) return ALL_YEARS
  if (filter !== null && years.includes(filter)) return filter
  return years[0] ?? ALL_YEARS
}

/** Sections without a year are unfiled and show under every filter. */
export function sectionMatchesYear(section: Section, year: string): boolean {
  return year === ALL_YEARS || section.schoolYear === '' || section.schoolYear === year
}

export interface SchoolYearFilter {
  year: string
  years: string[]
  setYear: (year: string) => Promise<void>
  matches: (section: Section) => boolean
}

export function useSchoolYearFilter(): SchoolYearFilter {
  const years = useSectionsStore((s) => s.schoolYears)
  const stored = useSettingsStore((s) => s.settings.schoolYearFilter)
  const update = useSettingsStore((s) => s.update)
  const year = effectiveSchoolYear(stored, years)
  return {
    year,
    years,
    setYear: (value) => update({ schoolYearFilter: value }),
    matches: (section) => sectionMatchesYear(section, year)
  }
}
