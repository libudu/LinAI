// ==UserScript==
// @name         互传网页版：视频文件夹
// @namespace    linpicio.easyshare
// @version      1.1.0
// @description  多选实际文件夹筛选视频，沿用互传原有的选择、下载、删除和排序操作
// @match        http://192.168.1.91/*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// @noframes
// ==/UserScript==

;(() => {
  'use strict'

  // 针对当前手机提供的 Web EasyShare web2.1.0.9；端口变化无需改脚本。
  if (window.__easyshareVideoFolders) return
  window.__easyshareVideoFolders = true

  const FILTER = 'LINPICIO_EASYSHARE_VIDEO_FOLDER'
  const RECEIVE = 'RECEIVE_POSTS_VIDEOLIST'
  const CLEAR_SELECTION = 'PAGE_VIDEO_NORMAL_SHOW_OPERATION_BUTTON'
  const UNKNOWN = '(无法识别文件夹)'
  const wrappedFactories = new WeakSet()
  let fullPayload = null
  // null 表示全部视频；Set 表示多选的文件夹，空 Set 表示不显示视频。
  let selectedFolders = null
  let folders = []
  let store = null
  let webpackRequire = null
  let panel = null
  let folderList = null
  let caption = null
  let search = ''
  let scheduled = false
  let listDirty = true
  let hooked = false
  let failed = false
  let lastBlocked = null

  function folderOf(item) {
    const path = typeof item.savePath === 'string' ? item.savePath : ''
    const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
    const separator = normalized.lastIndexOf('/')
    return separator > 0 ? normalized.slice(0, separator) : UNKNOWN
  }

  function rebuildFolders() {
    const counts = new Map()
    for (const video of fullPayload?.videoList || []) {
      const path = folderOf(video)
      counts.set(path, (counts.get(path) || 0) + 1)
    }
    folders = Array.from(counts, ([path, count]) => ({ path, count }))
    folders.sort((a, b) =>
      a.path.localeCompare(b.path, 'zh-CN', { numeric: true }),
    )
    if (selectedFolders !== null) {
      const available = new Set(
        [...selectedFolders].filter((path) => counts.has(path)),
      )
      if (available.size !== selectedFolders.size) selectedFolders = available
    }
    listDirty = true
  }

  function visiblePayload() {
    const videoList =
      selectedFolders === null
        ? fullPayload.videoList
        : fullPayload.videoList.filter((item) =>
            selectedFolders.has(folderOf(item)),
          )
    return {
      ...fullPayload,
      videoList,
      count: videoList.length,
      isSelected: false,
    }
  }

  function clearNativeSelection(videoList) {
    // 原网页依赖共享选择表和索引锚点；只隐藏 DOM 会导致批量操作选错文件。
    const shared = webpackRequire(2).a
    shared.videoSelected.clear()
    shared.videoIsRecordSelect = true
    shared.videoList = videoList
    webpackRequire(20).a.setAnchor(0)
  }

  function enhanceReducer(originalReducer) {
    return (previous, action) => {
      if (action.type === 'Initialize') {
        fullPayload = null
        selectedFolders = null
        rebuildFolders()
      }

      if (action.type === RECEIVE && Array.isArray(action.json?.videoList)) {
        // 缓存完整列表，后续排序和原网页刷新会替换这份缓存。
        fullPayload = {
          ...action.json,
          videoList: action.json.videoList.slice(),
        }
        rebuildFolders()
        const json = visiblePayload()
        clearNativeSelection(json.videoList)
        const next = originalReducer(previous, { ...action, json })
        return originalReducer(next, { type: CLEAR_SELECTION, show: false })
      }

      if (action.type === FILTER && fullPayload) {
        selectedFolders =
          action.folders === null ? null : new Set(action.folders)
        listDirty = true
        const json = visiblePayload()
        clearNativeSelection(json.videoList)
        const next = originalReducer(previous, { type: RECEIVE, json })
        return originalReducer(next, { type: CLEAR_SELECTION, show: false })
      }

      let next = originalReducer(previous, action)
      if (fullPayload && previous && action.type !== 'CLEAR_VIDEO_PAGE_DATA') {
        const before = previous.getIn(['CommonData', 'videoInfo', 'videoList'])
        const after = next.getIn(['CommonData', 'videoInfo', 'videoList'])
        if (before && after && before !== after) {
          // 单个/批量删除及手机推送更新仍由原 reducer 执行，然后同步缓存。
          const remaining = new Set(after.toJS().map((item) => item.savePath))
          const removed = new Set(
            before
              .toJS()
              .filter((item) => !remaining.has(item.savePath))
              .map((item) => item.savePath),
          )
          if (removed.size) {
            const videoList = fullPayload.videoList.filter(
              (item) => !removed.has(item.savePath),
            )
            fullPayload = { ...fullPayload, videoList, count: videoList.length }
            const oldFolders = selectedFolders
            rebuildFolders()
            if (oldFolders !== selectedFolders) {
              const json = visiblePayload()
              clearNativeSelection(json.videoList)
              next = originalReducer(next, { type: RECEIVE, json })
              next = originalReducer(next, {
                type: CLEAR_SELECTION,
                show: false,
              })
            }
          }
        }
      }
      return next
    }
  }

  function captureCreateStore(originalCreateStore) {
    return (reducer, ...args) => {
      const result = originalCreateStore(enhanceReducer(reducer), ...args)
      store = result
      hooked = true
      store.subscribe(scheduleUi)
      scheduleUi()
      return result
    }
  }

  function wrapChunk(chunk) {
    // 815 是当前版本的应用入口，101 是 Redux；只包装入口的 require。
    const factory = chunk?.[1]?.[815]
    if (typeof factory !== 'function' || wrappedFactories.has(factory)) return
    const wrapped = function (module, exports, require) {
      webpackRequire = require
      const redux = require(101)
      if (typeof redux.c !== 'function') {
        failed = true
        scheduleUi()
        return factory.call(this, module, exports, require)
      }
      const replacement = { ...redux, c: captureCreateStore(redux.c) }
      const interceptedRequire = new Proxy(require, {
        apply(target, thisArg, args) {
          return String(args[0]) === '101'
            ? replacement
            : Reflect.apply(target, thisArg, args)
        },
      })
      return factory.call(this, module, exports, interceptedRequire)
    }
    wrappedFactories.add(wrapped)
    chunk[1][815] = wrapped
  }

  // Webpack 启动时会替换 push，并保存旧 push。每层闭包保留自己的委托，避免递归。
  const queue = (window.webpackJsonpairtoolweb =
    window.webpackJsonpairtoolweb || [])
  for (const chunk of queue) wrapChunk(chunk)
  let push = interceptPush(queue.push)
  function interceptPush(delegate) {
    return function (...chunks) {
      for (const chunk of chunks) wrapChunk(chunk)
      return Reflect.apply(delegate, this, chunks)
    }
  }
  Object.defineProperty(queue, 'push', {
    configurable: true,
    get: () => push,
    set: (delegate) => {
      push = interceptPush(delegate)
    },
  })

  function element(tag, className, text) {
    const node = document.createElement(tag)
    node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  function addStyles() {
    if (document.getElementById('esvf-style')) return
    const style = document.createElement('style')
    style.id = 'esvf-style'
    style.textContent = `
      #esvf-panel { position:fixed; z-index:9990; width:272px; max-width:calc(100vw - 24px);
        box-sizing:border-box; padding:12px; background:#fff; color:#333; border:1px solid #ddd;
        border-radius:8px; box-shadow:0 3px 16px #0002; font:13px/1.5 "Microsoft YaHei",sans-serif; }
      #esvf-panel * { box-sizing:border-box; }
      .esvf-title { font-size:15px; font-weight:bold; margin-bottom:5px; }
      .esvf-caption { margin-bottom:9px; color:#666; overflow-wrap:anywhere; }
      .esvf-search { display:block; width:100%; height:32px; padding:5px 8px; margin-bottom:8px;
        color:#333; background:white; border:1px solid #ccc; border-radius:4px; }
      .esvf-list { overflow-y:auto; max-height:46vh; }
      .esvf-folder { display:block; width:100%; padding:8px; margin:0 0 4px; text-align:left;
        color:#333; background:#f7f7f7; border:1px solid transparent; border-radius:4px; cursor:pointer; }
      .esvf-folder:hover { background:#edf5ff; }
      .esvf-folder[aria-pressed="true"], .esvf-folder[aria-checked="true"] {
        color:#1666b5; background:#e5f2ff; border-color:#91c6f7; }
      .esvf-folder:disabled { cursor:wait; opacity:.6; }
      .esvf-name { display:block; font-weight:bold; overflow-wrap:anywhere; }
      .esvf-check { display:inline-block; width:15px; height:15px; margin-right:6px;
        border:1px solid #aaa; border-radius:3px; vertical-align:middle; text-align:center;
        font-size:12px; line-height:13px; background:white; }
      .esvf-folder[aria-checked="true"] .esvf-check { background:#1666b5; border-color:#1666b5; color:white; }
      .esvf-path { display:block; font-size:11px; color:#777; overflow-wrap:anywhere; }
      .esvf-note { margin-top:8px; color:#777; font-size:11px; }
      #esvf-error { position:fixed; z-index:9999; bottom:16px; right:16px; max-width:340px;
        padding:12px; color:#333; background:#fff6d9; border:1px solid #e2c06a; border-radius:6px; }
    `
    document.head.append(style)
  }

  function mountPanel() {
    if (panel?.isConnected) return
    addStyles()
    panel = element('aside')
    panel.id = 'esvf-panel'
    panel.setAttribute('aria-label', '视频文件夹筛选')
    panel.hidden = true
    panel.append(element('div', 'esvf-title', '视频文件夹 · 多选'))
    caption = element('div', 'esvf-caption')
    panel.append(caption)
    const input = element('input', 'esvf-search')
    input.type = 'search'
    input.placeholder = '搜索文件夹名称或路径'
    input.setAttribute('aria-label', input.placeholder)
    input.value = search
    input.addEventListener('input', () => {
      search = input.value.toLocaleLowerCase().trim()
      listDirty = true
      scheduleUi()
    })
    panel.append(input)
    folderList = element('div', 'esvf-list')
    panel.append(folderList)
    panel.append(
      element(
        'div',
        'esvf-note',
        '勾选多个文件夹可合并显示；更改文件夹筛选会清空视频选择。',
      ),
    )
    // 面板挂到 body，避免 React 重绘或拖选接管它。
    for (const event of ['mousedown', 'touchstart', 'keydown']) {
      panel.addEventListener(event, (e) => e.stopPropagation())
    }
    document.body.append(panel)
    listDirty = true
  }

  function chooseFolder(path) {
    if (!store || !fullPayload) return
    if (interactionBlocked(store.getState())) return
    if (path === null && selectedFolders === null) return
    let selection = null
    if (path !== null) {
      selection = new Set(selectedFolders || [])
      if (selection.has(path)) selection.delete(path)
      else selection.add(path)
    }
    store.dispatch({
      type: FILTER,
      folders: selection === null ? null : [...selection],
    })
    const container = document.getElementById('videoList_con')
    if (container) {
      container.scrollTop = 0
      for (const child of container.querySelectorAll('*')) {
        if (child.scrollTop) child.scrollTop = 0
      }
    }
  }

  function interactionBlocked(state) {
    // 删除确认和执行期间保持索引稳定，等待原网页完成操作后再允许切换。
    return Boolean(
      state.getIn(['CommonData', 'videoNormalListLoading']) ||
      state.getIn(['Dialog', 'show']) ||
      state.getIn(['Dialog', 'isDeleteing']) ||
      state.getIn(['DialogWithFunc', 'show']) ||
      state.getIn(['Loading', 'show']),
    )
  }

  function folderButton(path, count, loading) {
    const button = element('button', 'esvf-folder')
    button.type = 'button'
    button.disabled = loading
    if (path === null) {
      button.setAttribute('aria-pressed', String(selectedFolders === null))
      button.append(element('span', 'esvf-name', `全部视频 (${count})`))
    } else {
      const checked = selectedFolders?.has(path) || false
      button.setAttribute('role', 'checkbox')
      button.setAttribute('aria-checked', String(checked))
      button.title = path
      const name = element('span', 'esvf-name')
      const mark = element('span', 'esvf-check', checked ? '✓' : '')
      mark.setAttribute('aria-hidden', 'true')
      name.append(
        mark,
        document.createTextNode(`${path.split('/').pop()} (${count})`),
      )
      button.append(name)
      button.append(
        element(
          'span',
          'esvf-path',
          path.replace(/^\/storage\/emulated\/0\//, '内部存储/'),
        ),
      )
    }
    button.addEventListener('click', () => chooseFolder(path))
    return button
  }

  function updateUi() {
    scheduled = false
    if (!document.body || !document.head) return
    if (!hooked) {
      if (failed && !document.getElementById('esvf-error')) {
        addStyles()
        const warning = element(
          'div',
          '',
          '视频文件夹脚本未接入：请刷新页面，并确认 Tampermonkey 允许用户脚本。若仍无效，互传网页版本可能已变化。',
        )
        warning.id = 'esvf-error'
        document.body.append(warning)
      }
      return
    }
    mountPanel()
    const state = store.getState()
    const active =
      state.getIn(['PageSwitch', 'VideoListShow']) &&
      state.getIn(['PageSwitch', 'VideoNormalPageShow']) &&
      !state.getIn(['CommonData', 'isSearching']) &&
      state.getIn(['PageSwitch', 'showMainPage'])
    const modalOpen =
      state.getIn(['Dialog', 'show']) ||
      state.getIn(['DialogWithFunc', 'show']) ||
      state.getIn(['Loading', 'show'])
    panel.hidden = !active || Boolean(modalOpen)
    if (!active || modalOpen) return
    const container = document.getElementById('videoList_con')
    if (!container) {
      panel.hidden = true
      return
    }
    const bounds = container.getBoundingClientRect()
    // 留出原视频列表的空间，面板不参与 React 的 DOM 管理。
    panel.style.left = `${Math.max(12, bounds.left + 12)}px`
    panel.style.top = `${Math.max(12, bounds.top + 12)}px`
    const list = container.querySelector('.videoList')
    if (list) {
      const availableWidth = Math.max(180, container.clientWidth - 308)
      list.style.width = `${availableWidth}px`
      list.style.marginLeft = '296px'
    }
    const loading = Boolean(
      state.getIn(['CommonData', 'videoNormalListLoading']),
    )
    const blocked = interactionBlocked(state)
    const total = fullPayload?.videoList.length || 0
    const visible =
      state.getIn(['CommonData', 'videoInfo', 'videoList'])?.size || 0
    const selectionText =
      selectedFolders === null
        ? '全部文件夹'
        : `已选 ${selectedFolders.size} 个文件夹`
    caption.textContent = fullPayload
      ? `共 ${folders.length} 个文件夹 · ${selectionText} · 当前 ${visible} / 共 ${total} 个视频${loading ? ' · 正在更新' : ''}`
      : '正在等待视频列表…'
    if (blocked !== lastBlocked) {
      lastBlocked = blocked
      listDirty = true
    }
    if (!listDirty) return
    listDirty = false
    const fragment = document.createDocumentFragment()
    fragment.append(folderButton(null, total, blocked || !fullPayload))
    let matched = 0
    for (const folder of folders) {
      if (search && !folder.path.toLocaleLowerCase().includes(search)) continue
      fragment.append(folderButton(folder.path, folder.count, blocked))
      matched++
    }
    if (search && !matched)
      fragment.append(element('div', 'esvf-note', '没有匹配的文件夹'))
    folderList.replaceChildren(fragment)
  }

  function scheduleUi() {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(updateUi)
  }

  function observePage() {
    new MutationObserver((records) => {
      // 只关注原网页，避免面板自身刷新引发循环。
      if (records.some((record) => !panel?.contains(record.target)))
        scheduleUi()
    }).observe(document.body, { childList: true, subtree: true })
    scheduleUi()
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observePage, { once: true })
  } else observePage()
  window.addEventListener('resize', scheduleUi)
  window.setTimeout(() => {
    if (!hooked) {
      failed = true
      scheduleUi()
    }
  }, 15000)
})()
