export interface FeatureFlag {
  id: string
  name: string
  description: string
  defaultEnabled?: boolean
}

export const FEATURE_FLAGS: Record<string, FeatureFlag> = {
  preset_export_import: {
    id: 'preset_export_import',
    name: '预设导出/导入',
    description: '支持将模板导出为文件，以及从文件导入模板',
    defaultEnabled: false,
  },
}

export const getExperimentalFeatures = () => {
  return Object.values(FEATURE_FLAGS)
}

export const isFeatureEnabled = (
  featureId: string,
  enabledFlags: Record<string, boolean>,
): boolean => {
  const flag = FEATURE_FLAGS[featureId]
  if (!flag) return false
  return enabledFlags[featureId] ?? flag.defaultEnabled ?? false
}
