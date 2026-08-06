# 功能：书架 / 导航页

## 目标

导航页以「书架」形式呈现书目。《老人与海》可进入阅读，其余为「制作中」占位。悬停任一可读书籍显示故事摘要与「查看素材」入口。

## 数据

```js
SHELF_BOOKS = [
  { id:'oldman',   title:'老人与海', author:'海明威',     cover:'assets/act1.png', ready:true,  summary:'…' },
  { id:'solitude', title:'百年孤独', author:'马尔克斯',   cover:null, ready:false, summary:'…' },
  { id:'prince',   title:'小王子',   author:'圣埃克苏佩里', cover:null, ready:false, summary:'…' },
  { id:'fortress', title:'围城',     author:'钱钟书',     cover:null, ready:false, summary:'…' },
]
```

自定义书从 `loadCustomBooks()` 追加渲染。书架末尾固定一张「＋ 添加我的书」卡。

## 渲染

`renderShelf()`：
- `ready` 书 → `bookCardHTML(...)`
- 未 ready → `.shelf-book.wip`（灰底占位 + 「制作中」徽章 + 悬停摘要）
- 自定义书 → `bookCardHTML(...)`
- 追加 `.shelf-book.add`（点击 `openAdd()`）

`bookCardHTML(b)` 输出 `.shelf-book.ready[data-shelf="book"][data-book=id]`：
- `.spine`：有封面用背景图，无封面用 `.no-cover` 文字块 + 底部 `.cap`（书名/作者）
- `.shelf-hover`：`.sh-sum`（摘要）+ `.sh-assets`（🎨 查看素材按钮）

事件绑定（`renderShelf` 末尾）：
- `.add` → `openAdd()`
- 书脊 `.spine` → `onPickBook(bookId)`
- `.sh-assets` → `e.stopPropagation()` 后 `openAssets(bookId)`

## 选书分流

`shelfMode`（`'nav'|'read'|'chat'`）由 `showShelf(mode)` 设置：
- 「导航页」入口 → `nav`：`onPickBook` 展开 `#book-detail`，用户选「📖 传统阅读」或「💬 沉浸对话」
- 「传统阅读」入口 → `read`：选书直接 `enterRead()`（`go('acts')`）
- 「沉浸对话」入口 → `chat`：选书直接 `enterChat()`（`go('chat')`）

目前非 `oldman` 的可读书在 `onPickBook` 仅弹提示（完整内容开发中）。

## 悬停浮层 CSS

`.shelf-hover`（绝对定位覆盖书脊，默认 `opacity:0`）在 `.shelf-book:hover` 时淡入。`.sh-sum` 摘要、`.sh-assets` 强调按钮、`.sh-wip` 制作中提示、`.no-cover` 无封面书脊。

## 相关代码

`app.js`：`SHELF_BOOKS`、`showShelf`、`onPickBook`、`enterRead`、`enterChat`、`renderShelf`、`bookCardHTML`、`showBookDetail`、`openAssets`。
