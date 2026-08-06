# 项目架构

## 目录结构

```
mvp/
├── index.html          # 单页应用：所有视图 + CSS + 弹窗结构
├── app.js              # 全部交互逻辑（IIFE，暴露 window.app）
├── data/
│   ├── book-data.js    # 《老人与海》分幕内容（BOOK.acts）
│   └── footnotes.js    # 脚注数据
├── assets/             # 封面/插图（act1.png…）
└── docs/               # 开发文档（本目录）
```

## 运行方式

无构建步骤，静态托管即可：

```bash
npx serve -p 5500 mvp
```

## 视图模型

单页多视图，通过 `go(viewKey)` 切换 `#view-*` 的显隐，同时高亮右侧导航。

| 视图 | 元素 | 导航名 | 说明 |
|------|------|--------|------|
| cover | `#view-cover` | 导航页 | 书架 + 书籍详情 |
| acts | `#view-acts` | 传统阅读 | 分幕阅读 |
| chat | `#view-chat` | 沉浸对话 | 视角选择 + 互动叙事舞台 |
| about | `#view-about` | 关于 | 项目说明 |

「传统阅读」「沉浸对话」导航项也先落在书架（`showShelf('read'|'chat')`），选书后进入对应模式。`shelfMode`（`'nav'|'read'|'chat'`）记录当前书架意图，`onPickBook(bookId)` 据此分流。

## 状态与持久化（localStorage）

| 键 | 内容 |
|----|------|
| `oldman_progress_v1` | 阅读进度（已读幕次） |
| `dev_mm_img` / `dev_mm_voice` | MiniMax 图片 / 语音密钥 |
| `dev_llm_base` / `dev_llm_key` / `dev_llm_model` | LLM 配置（OpenAI 兼容） |
| `anchor_assets` | 按书绑定的锚点素材 `{ [bookId]: { char_turnaround, bg_scene } }` |
| `custom_books` | 用户上传生成的书籍数组 |
| `unlocked` | `'1'` 表示已输入体验码 |

访问器：`getCfg(k)`/`setCfg(k,v)`（读写 `dev_` 前缀）、`isUnlocked()`/`setUnlocked()`、`loadAllAnchors()`/`loadAnchorAssets(bookId)`/`saveAnchorAsset(bookId,key,url)`、`loadCustomBooks()`。

## 书籍与锚点数据

- `SHELF_BOOKS`：书架书目 `{ id, title, author, cover, ready, summary }`。仅 `oldman` 有完整内容，其余为「制作中」占位。
- `BOOK_ANCHORS`：按书的视觉锚点 `{ [bookId]: { character, style, location } }`。
- `getAnchors(bookId)`：优先取内置锚点 → 自定义书 `anchorSpec` → 回退 `BOOK_ANCHORS.oldman`。

锚点用于所有图片生成的 prompt 拼接，保证同一本书的人物/风格/场景前后一致。

## 外部依赖

- **mammoth.js**（CDN）：浏览器端解析 `.docx`。
- **MiniMax**：`api.minimaxi.com`，图片 `image_generation`、语音 `t2a_v2`。密钥仅本地。
- **LLM**：任意 OpenAI 兼容 `/chat/completions`，用于沉浸对话与书籍解析，要求 `response_format: json_object`。

## `window.app` 暴露接口

`go, openAct, nextAct, sendMsg, speakAct, speakFromPara, stopSpeak, speak, toggleChatMute, openDev, closeDev, saveDev, genAnchors, openAdd, closeAdd, showShelf, enterRead, enterChat, restartStory, openAssets, onPickBook`。

其余函数均为 IIFE 内部私有，不对外暴露。
