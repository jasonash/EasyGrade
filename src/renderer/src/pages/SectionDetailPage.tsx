import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { Box, Button, Chip, IconButton, Stack, Tab, Tabs, Tooltip, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DownloadIcon from '@mui/icons-material/Download'
import { api, unwrap } from '@/api'
import { describeError } from '@/lib/errors'
import { useUiStore, type SectionTab } from '@/stores/ui.store'
import { useSectionsStore } from '@/stores/sections.store'
import { RosterTab } from '@/components/students/RosterTab'
import { TestsList } from '@/components/tests/TestsList'

export function SectionDetailPage(): JSX.Element {
  const sectionId = useUiStore((s) => s.selectedSectionId)
  const tab = useUiStore((s) => s.sectionTab)
  const setTab = useUiStore((s) => s.setSectionTab)
  const navigate = useUiStore((s) => s.navigate)
  const toast = useUiStore((s) => s.toast)
  const [exporting, setExporting] = useState(false)
  const section = useSectionsStore((s) => s.sections.find((x) => x.id === sectionId) ?? null)
  const sectionsLoading = useSectionsStore((s) => s.loading)

  // If the section disappeared (deleted, or archived while hidden), go back to the list.
  useEffect(() => {
    if (!sectionsLoading && sectionId !== null && section === null) navigate('sections')
  }, [sectionsLoading, sectionId, section, navigate])

  if (!section) return <Box />

  const exportCsv = (): void => {
    setExporting(true)
    void unwrap(api.export.sectionCsv(section.id))
      .then((outcome) => {
        if (outcome) toast('success', `Saved ${outcome.rows} students to ${outcome.path}`)
      })
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => setExporting(false))
  }

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
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title="One row per student, one column per finalized test, plus an average">
          <span>
            <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={exportCsv} disabled={exporting || section.testCount === 0}>
              Export grades
            </Button>
          </span>
        </Tooltip>
      </Stack>

      <Tabs value={tab} onChange={(_, value: SectionTab) => setTab(value)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label={`Roster (${section.studentCount})`} value="roster" />
        <Tab label={`Tests (${section.testCount})`} value="tests" />
      </Tabs>

      {tab === 'roster' ? <RosterTab section={section} /> : null}
      {tab === 'tests' ? <TestsList sectionId={section.id} /> : null}
    </>
  )
}
