import { Dropdown, type DropdownProps } from 'antd'
import {
  cloneElement,
  type HTMLAttributes,
  type ReactElement,
  type SyntheticEvent,
} from 'react'
import { useLongPressContextMenu } from '../hooks/useLongPressContextMenu'

type TriggerProps = HTMLAttributes<HTMLElement> & {
  'data-context-menu-trigger'?: ''
}

function composeHandlers<Event extends SyntheticEvent>(
  handler: (event: Event) => void,
  existingHandler?: (event: Event) => void,
) {
  return (event: Event) => {
    handler(event)
    if (!event.isPropagationStopped()) existingHandler?.(event)
  }
}

/** 右键与触屏长按共用菜单，子元素需将事件和 data 属性转发到实际触发元素。 */
export function ContextMenu({
  children,
  disabled = false,
  popupRender,
  ...props
}: Omit<DropdownProps, 'children' | 'dropdownRender' | 'trigger'> & {
  children: ReactElement<TriggerProps>
}) {
  const handlers = useLongPressContextMenu(disabled)
  // 禁用菜单时保留子元素的交互，避免 Dropdown 将 disabled 传给按钮。
  if (disabled) return children

  const childProps = children.props
  const trigger = cloneElement(children, {
    'data-context-menu-trigger': '',
    onContextMenu: (event) => {
      childProps.onContextMenu?.(event)
      event.stopPropagation()
    },
    onTouchStartCapture: composeHandlers(
      handlers.onTouchStartCapture,
      childProps.onTouchStartCapture,
    ),
    onTouchMoveCapture: composeHandlers(
      handlers.onTouchMoveCapture,
      childProps.onTouchMoveCapture,
    ),
    onTouchEndCapture: composeHandlers(
      handlers.onTouchEndCapture,
      childProps.onTouchEndCapture,
    ),
    onTouchCancelCapture: composeHandlers(
      handlers.onTouchCancelCapture,
      childProps.onTouchCancelCapture,
    ),
    onClickCapture: composeHandlers(
      handlers.onClickCapture,
      childProps.onClickCapture,
    ),
  })

  return (
    <Dropdown
      {...props}
      trigger={['contextMenu']}
      popupRender={(node) => (
        // Portal 中的点击仍会沿 React 树冒泡，可能误选中树节点或图片。
        <div onClick={(event) => event.stopPropagation()}>
          {popupRender ? popupRender(node) : node}
        </div>
      )}
    >
      {trigger}
    </Dropdown>
  )
}
