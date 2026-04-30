# 实验性功能开关系统

## 系统概述

实验性功能开关系统允许开发者将新功能标记为"实验性"，用户需要在设置中手动开启后才能使用。这使得新功能可以在受控环境下进行测试，同时不影响主要用户体验。

## 核心文件

| 文件路径 | 作用 |
|---------|------|
| `src/client/utils/featureFlags.ts` | 功能注册表，定义所有实验性功能 |
| `src/client/hooks/useFeatureFlags.ts` | 提供便捷的 Hooks |
| `src/client/hooks/useLocalSetting.tsx` | 存储用户的功能开关状态 |
| `src/client/common/SettingModal/ExperimentalFeatureSetting.tsx` | 设置页面中的实验性功能页签 |

## 系统流程

```
1. 开发者在 featureFlags.ts 中注册新功能
         ↓
2. 用户使用 useFeatureFlag hook 或 isFeatureEnabled 函数控制功能显示
         ↓
3. 用户在设置 → 实验性功能 中开启/关闭功能
         ↓
4. 开关状态持久化到 localStorage，刷新后保持不变
         ↓
5. 功能稳定后，从注册表中移除，集成到主流程
```

---

## 如何将功能添加为实验性功能

### 步骤 1：在注册表中注册功能

打开 `src/client/utils/featureFlags.ts`，在 `FEATURE_FLAGS` 对象中添加新功能：

```typescript
export const FEATURE_FLAGS: Record<string, FeatureFlag> = {
  my_new_feature: {
    id: 'my_new_feature',
    name: '我的新功能',
    description: '这是一个很酷的新功能描述',
    defaultEnabled: false,  // 默认关闭
  },
}
```

### 步骤 2：在组件中使用功能开关

#### 方式一：使用 `useFeatureFlag` Hook

```typescript
import { useFeatureFlag } from '../hooks/useFeatureFlags'

const MyComponent = () => {
  const { enabled } = useFeatureFlag('my_new_feature')

  if (!enabled) {
    return null  // 功能未开启时不显示
  }

  return <div>我的新功能内容</div>
}
```

#### 方式二：使用条件判断

```typescript
import { useLocalSetting } from '../hooks/useLocalSetting'
import { isFeatureEnabled } from '../utils/featureFlags'

const MyComponent = () => {
  const { featureFlags } = useLocalSetting()
  const isEnabled = isFeatureEnabled('my_new_feature', featureFlags)

  if (!isEnabled) return null

  return <div>我的新功能内容</div>
}
```

### 步骤 3：测试

1. 启动应用
2. 打开设置 → 实验性功能
3. 开启"我的新功能"开关
4. 返回页面查看新功能是否显示

---

## 如何将功能从实验性毕业为正式功能

### 步骤 1：从注册表中移除

打开 `src/client/utils/featureFlags.ts`，从 `FEATURE_FLAGS` 中删除该功能：

```typescript
// 删除这段
// my_new_feature: {
//   id: 'my_new_feature',
//   name: '我的新功能',
//   description: '这是一个很酷的新功能描述',
//   defaultEnabled: false,
// },
```

### 步骤 2：移除功能开关逻辑

将组件中的条件判断移除，直接渲染功能：

```typescript
// 之前
const MyComponent = () => {
  const { enabled } = useFeatureFlag('my_new_feature')
  if (!enabled) return null
  return <div>我的新功能内容</div>
}

// 之后 - 直接渲染
const MyComponent = () => {
  return <div>我的新功能内容</div>
}
```

### 步骤 3：清理导入

移除不再需要的导入语句：

```typescript
// 删除这些导入
// import { useFeatureFlag } from '../hooks/useFeatureFlags'
// import { isFeatureEnabled } from '../utils/featureFlags'
```

### 步骤 4：清理设置状态（可选）

如果希望清除用户之前保存的该功能开关状态，可以在 `useLocalSetting.tsx` 中添加清理逻辑，或者提示用户清除 localStorage。

---

## 注意事项

1. **功能 ID 唯一性**：确保每个功能的 `id` 是唯一的
2. **用户数据兼容**：从注册表移除功能后，用户 localStorage 中仍会保存旧的开关状态，但不会影响应用运行
3. **默认值**：`defaultEnabled: false` 表示新用户默认关闭，可设为 `true` 让新用户默认开启
4. **类型安全**：使用 `useFeatureFlag('my_new_feature')` 时，传入的 ID 必须在注册表中存在，否则 `enabled` 会返回 `false`
