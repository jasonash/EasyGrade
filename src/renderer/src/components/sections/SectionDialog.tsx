import type { JSX } from 'react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField
} from '@mui/material'
import { SectionInputSchema, type SectionInput } from '@shared/schemas'
import type { Section } from '@shared/types'

interface Props {
  open: boolean
  section: Section | null
  schoolYears: string[]
  onClose: () => void
  onSubmit: (input: SectionInput) => Promise<void>
}

export function SectionDialog({ open, section, schoolYears, onClose, onSubmit }: Props): JSX.Element {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<SectionInput>({
    resolver: zodResolver(SectionInputSchema),
    defaultValues: { name: '', schoolYear: '' }
  })

  useEffect(() => {
    if (open) {
      reset({
        name: section?.name ?? '',
        schoolYear: section?.schoolYear ?? schoolYears[0] ?? ''
      })
    }
  }, [open, section, schoolYears, reset])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <form
        onSubmit={handleSubmit(async (values) => {
          await onSubmit(values)
        })}
      >
        <DialogTitle>{section ? 'Rename Section' : 'New Section'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Section name"
                  placeholder="First Block Chemistry"
                  autoFocus
                  fullWidth
                  error={Boolean(errors.name)}
                  helperText={errors.name?.message}
                />
              )}
            />
            <Controller
              name="schoolYear"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  freeSolo
                  options={schoolYears}
                  value={field.value ?? ''}
                  onChange={(_, value) => field.onChange(value ?? '')}
                  onInputChange={(_, value) => field.onChange(value)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="School year"
                      placeholder="2026-27"
                      error={Boolean(errors.schoolYear)}
                      helperText={errors.schoolYear?.message ?? 'Optional. Used to filter old sections.'}
                    />
                  )}
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {section ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}