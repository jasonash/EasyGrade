import type { JSX } from 'react'
import { Typography } from '@mui/material'
import { PageHeader } from '@/components/common/PageHeader'
import { TestsList } from '@/components/tests/TestsList'
import { useSchoolYearFilter } from '@/lib/schoolYear'
import { ALL_YEARS } from '@/lib/schoolYear'

export function TestsPage(): JSX.Element {
  const { year } = useSchoolYearFilter()
  return (
    <>
      <PageHeader
        title="Tests"
        subtitle="Single-page multiple-choice tests"
        actions={
          year !== ALL_YEARS ? (
            <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
              Showing {year}
            </Typography>
          ) : undefined
        }
      />
      <TestsList filter={(t) => year === ALL_YEARS || t.schoolYear === '' || t.schoolYear === year} />
    </>
  )
}
