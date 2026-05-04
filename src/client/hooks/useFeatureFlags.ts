import { useLocalSetting } from '../hooks/useLocalSetting'
import { FEATURE_FLAGS, isFeatureEnabled } from '../utils/featureFlags'

export function useFeatureFlag(featureId: string) {
  const { featureFlags, setFeatureFlags } = useLocalSetting()

  const enabled = isFeatureEnabled(featureId, featureFlags)
  const feature = FEATURE_FLAGS[featureId]

  const toggle = () => {
    setFeatureFlags((prev) => ({
      ...prev,
      [featureId]: !prev[featureId],
    }))
  }

  const setEnabled = (value: boolean) => {
    setFeatureFlags((prev) => ({
      ...prev,
      [featureId]: value,
    }))
  }

  return {
    enabled,
    feature,
    toggle,
    setEnabled,
  }
}

export function useAllFeatureFlags() {
  const { featureFlags, setFeatureFlags } = useLocalSetting()

  const toggleFeature = (featureId: string, value: boolean) => {
    setFeatureFlags((prev) => ({
      ...prev,
      [featureId]: value,
    }))
  }

  return {
    featureFlags,
    allFeatures: Object.values(FEATURE_FLAGS),
    toggleFeature,
  }
}
