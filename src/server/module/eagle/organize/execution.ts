import type {
  OrganizeClassificationMode,
  OrganizeItemStatus,
} from '@/shared/eagle/organize'

export const needsOrganizeExecution = (
  status: OrganizeItemStatus | undefined,
  classificationMode: OrganizeClassificationMode,
): boolean =>
  status === undefined ||
  status === 'pending' ||
  (classificationMode === 'recursive-rename' && status === 'success')
