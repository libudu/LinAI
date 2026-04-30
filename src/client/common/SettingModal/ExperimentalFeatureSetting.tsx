import { Card, Switch, Typography } from 'antd'
import { useAllFeatureFlags } from '../../hooks/useFeatureFlags'

const { Text } = Typography

export const ExperimentalFeatureSettings = () => {
  const { allFeatures, featureFlags, toggleFeature } = useAllFeatureFlags()

  if (allFeatures.length === 0) {
    return (
      <div className="px-4 py-2">
        <Text type="secondary">当前没有实验性功能</Text>
      </div>
    )
  }

  return (
    <div className="px-4 py-2">
      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3">
        <Text type="warning" className="block font-medium mb-1">
          实验性功能
        </Text>
        <Text type="secondary" className="text-xs">
          实验性功能可能不稳定，请谨慎使用。开启后可以在界面中看到新的功能按钮或组件。
        </Text>
      </div>

      <div className="space-y-3">
        {allFeatures.map((feature) => (
          <Card key={feature.id} size="small">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="font-medium">{feature.name}</div>
                <Text type="secondary" className="text-xs">
                  {feature.description}
                </Text>
              </div>
              <Switch
                checked={featureFlags[feature.id] ?? false}
                onChange={(checked) => toggleFeature(feature.id, checked)}
                size="small"
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
