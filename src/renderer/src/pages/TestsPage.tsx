import type { JSX } from 'react'
import { useState } from 'react'
import {
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material'
import ClearIcon from '@mui/icons-material/Clear'
import SearchIcon from '@mui/icons-material/Search'
import type { TestSummary } from '@shared/types'
import { PageHeader } from '@/components/common/PageHeader'
import { NewTestButton, TestsList } from '@/components/tests/TestsList'
import { useSectionsStore } from '@/stores/sections.store'
import { DEFAULT_TESTS_FILTER, useUiStore, type TestStatusFilter } from '@/stores/ui.store'
import { ALL_YEARS, useSchoolYearFilter } from '@/lib/schoolYear'

const ALL_SECTIONS = ''

export function TestsPage(): JSX.Element {
  const { year, matches } = useSchoolYearFilter()
  const sections = useSectionsStore((s) => s.sections)
  const filter = useUiStore((s) => s.testsFilter)
  const setFilter = useUiStore((s) => s.setTestsFilter)
  const [newOpen, setNewOpen] = useState(false)

  // The chosen section stays selectable even when the school-year filter would
  // hide it; a section that is no longer loaded (deleted, archived) means "all".
  const chosen = sections.find((s) => s.id === filter.sectionId) ?? null
  const options = sections.filter((s) => matches(s) || s.id === chosen?.id)
  const sectionId = chosen?.id ?? null
  const query = filter.query.trim().toLowerCase()
  const filtering = sectionId !== null || query !== '' || filter.status !== 'all'

  const visible = (t: TestSummary): boolean =>
    (year === ALL_YEARS || t.schoolYear === '' || t.schoolYear === year) &&
    (sectionId === null || t.sectionId === sectionId) &&
    (filter.status === 'all' || t.status === filter.status) &&
    (query === '' || t.title.toLowerCase().includes(query))

  return (
    <>
      <PageHeader
        title="Tests"
        subtitle={`Single-page multiple-choice tests${year !== ALL_YEARS ? ` · showing ${year}` : ''}`}
        actions={<NewTestButton onClick={() => setNewOpen(true)} />}
      />

      {sections.length > 0 ? (
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="tests-section-label">Section</InputLabel>
            <Select
              labelId="tests-section-label"
              label="Section"
              value={sectionId ?? ALL_SECTIONS}
              onChange={(e) => setFilter({ sectionId: typeof e.target.value === 'number' ? e.target.value : null })}
            >
              <MenuItem value={ALL_SECTIONS}>All sections</MenuItem>
              {options.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                  {s.schoolYear && year === ALL_YEARS ? ` (${s.schoolYear})` : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            placeholder="Search titles"
            value={filter.query}
            onChange={(e) => setFilter({ query: e.target.value })}
            inputProps={{ 'aria-label': 'Search tests by title' }}
            sx={{ minWidth: 220 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment:
                  filter.query !== '' ? (
                    <InputAdornment position="end">
                      <IconButton size="small" edge="end" aria-label="Clear search" onClick={() => setFilter({ query: '' })}>
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : null
              }
            }}
          />
          <ToggleButtonGroup
            exclusive
            size="small"
            color="primary"
            value={filter.status}
            onChange={(_, next: TestStatusFilter | null) => next && setFilter({ status: next })}
            aria-label="Status"
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="draft">Drafts</ToggleButton>
            <ToggleButton value="finalized">Finalized</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      ) : null}

      <TestsList
        filter={visible}
        onClearFilter={filtering ? () => setFilter(DEFAULT_TESTS_FILTER) : undefined}
        newTest={{ open: newOpen, onOpen: () => setNewOpen(true), onClose: () => setNewOpen(false) }}
      />
    </>
  )
}
