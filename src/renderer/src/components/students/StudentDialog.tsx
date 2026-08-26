import type { JSX } from 'react'
import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material'
import { StudentNameSchema, StudentNumberSchema } from '@shared/schemas'
import type { Student } from '@shared/types'

const FormSchema = z.object({
  lastName: StudentNameSchema,
  firstName: StudentNameSchema,
  studentNumber: StudentNumberSchema
})
export type StudentFormValues = z.infer<typeof FormSchema>

interface Props {
  open: boolean
  student: Student | null
  /** The rest of the roster, to warn about a reused student number before saving. */
  others?: Student[]
  onClose: () => void
  onSubmit: (values: StudentFormValues) => Promise<void>
}

export function StudentDialog({ open, student, others = [], onClose, onSubmit }: Props): JSX.Element {
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<StudentFormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { lastName: '', firstName: '', studentNumber: '' }
  })

  useEffect(() => {
    if (open) {
      reset({
        lastName: student?.lastName ?? '',
        firstName: student?.firstName ?? '',
        studentNumber: student?.studentNumber ?? ''
      })
    }
  }, [open, student, reset])

  const number = (useWatch({ control, name: 'studentNumber' }) ?? '').trim()
  const duplicate = number === '' ? null : (others.find((o) => o.studentNumber === number) ?? null)

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit(async (values) => onSubmit(values))}>
        <DialogTitle>{student ? 'Edit Student' : 'Add Student'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Controller
              name="lastName"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Last name"
                  autoFocus
                  fullWidth
                  error={Boolean(errors.lastName)}
                  helperText={errors.lastName?.message}
                />
              )}
            />
            <Controller
              name="firstName"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="First name"
                  fullWidth
                  error={Boolean(errors.firstName)}
                  helperText={errors.firstName?.message}
                />
              )}
            />
            <Controller
              name="studentNumber"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Student number"
                  fullWidth
                  error={Boolean(errors.studentNumber) || duplicate !== null}
                  helperText={
                    errors.studentNumber?.message ??
                    (duplicate ? `${duplicate.lastName}, ${duplicate.firstName} already has this number` : 'Optional. District ID, shown on exports.')
                  }
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting || duplicate !== null}>
            {student ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
