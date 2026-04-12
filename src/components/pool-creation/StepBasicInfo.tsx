import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { stepBasicInfoSchema, type StepBasicInfoData } from '@/lib/validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  defaultValues: StepBasicInfoData
  onNext: (data: StepBasicInfoData) => void
  onCancel: () => void
}

export default function StepBasicInfo({ defaultValues, onNext, onCancel }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<StepBasicInfoData>({
    resolver: zodResolver(stepBasicInfoSchema),
    defaultValues,
  })

  const hasGroupStage = watch('has_group_stage')

  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Pool Name</Label>
        <Input id="name" placeholder="e.g. Office World Cup Pool" {...register('name')} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sport">Sport</Label>
        <Input id="sport" placeholder="e.g. Football, Basketball" {...register('sport')} />
        {errors.sport && <p className="text-xs text-destructive">{errors.sport.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">
          Description <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="description"
          placeholder="What are the stakes?"
          rows={3}
          {...register('description')}
        />
        {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="start_datetime">Start Date & Time</Label>
        <Input id="start_datetime" type="datetime-local" {...register('start_datetime')} />
        {errors.start_datetime && <p className="text-xs text-destructive">{errors.start_datetime.message}</p>}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="has_group_stage"
          checked={hasGroupStage}
          onChange={(e) => setValue('has_group_stage', e.target.checked)}
          className="size-4 rounded border-input"
        />
        <Label htmlFor="has_group_stage">Include a group stage before knockout</Label>
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Next</Button>
      </div>
    </form>
  )
}
