import type { JSX } from 'react'
import { useEffect } from 'react'
import { Box, Chip, IconButton, Stack, Tab, Tabs, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { useUiStore, type SectionTab } from '@/stores/ui.store'
import { useSectionsStore } from '@/stores/sections.store'
import { EmptyState } from '@/components/common/EmptyState'
import { RosterTab } from '@/components/students/RosterTab'

export function SectionDetailPage(): JSX.Element {
  const sectionId = useUiStore((s) => s.selectedSectionId)
  const tab = useUiStore((s) => s.sectionTab)
  const setTab = useUiStore((s) => s.setSectionTab)
  const navigate = useUiStore((s) => s.navigate)
  const section = useSectionsStore((s) => s.sections.find((x) => x.id === sectionId) ?? null)
  const sectionsLoading = useSectionsStore((s) => s.loading)

  // If the section disappeared (deleted, or archived while hidden), go back to the list.
  useEffect(() => {
    if (!sectionsLoading && sectionId !== null && section === null) navigate('sections')
  }, [sectionsLoading, sectionId, section, navigate])

  if (!section) return <Box />

  return (
    <>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <IconButton onClick={() => navigate('sections')} aria-label="Back to sections" edge="start">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {section.name}
        </Typography>
        {section.schoolYear ? <Chip size="small" label={section.schoolYear} variant="outlined" /> : null}
        {section.archived ? <Chip size="small" label="Archived" /> : null}
      </Stack>

      <Tabs value={tab} onChange={(_, value: SectionTab) => setTab(value)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label={`Roster (${section.studentCount})`} value="roster" />
        <Tab label={`Tests (${section.testCount})`} value="tests" />
      </Tabs>

      {tab === 'roster' ? <RosterTab section={section} /> : null}
      {tab === 'tests' ? (
        <EmptyState title="No tests yet" description="Creating and printing tests arrives in Phase 3." />
      ) : null}
    </>
  )
}
