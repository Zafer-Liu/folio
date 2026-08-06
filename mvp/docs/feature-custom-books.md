# 功能：体验码门控 + 自定义书籍上传

## 目标

已解锁用户可上传一本书的文本，由 LLM 解析出元信息与锚点，生成人物三视图、场景背景图与第一章插图，确认后加入书架。

## 体验码门控

内置 `EXPERIENCE_CODE = '666'`。`isUnlocked()` 读 `localStorage.unlocked === '1'`，`setUnlocked()` 写入。

`openAdd()`：
- 已解锁 → 直接 `renderAddUpload()`
- 未解锁 → `renderAddCode()`：输入体验码，正确则 `setUnlocked()` 并进入上传。

同一个 `unlocked` 状态也门控书架「查看素材」弹窗中的「生成素材」按钮（见 feature-anchor-assets）。

## 上传与解析

`renderAddUpload()` → 选择 `.txt` / `.docx`（PDF 提示先转 txt）。

`handleFile(file)`：
- `.docx` 用 `window.mammoth.extractRawText` 提取纯文本；`.txt` 用 `file.text()`。
- 文本过短（<50 字）报错。
- 截取前 8000 字交给 `generateBook(excerpt, fname)`。

`generateBook`：校验 LLM 配置 → 调 `/chat/completions`（`response_format` 靠 system 提示约束）→ 要求输出 JSON：

```json
{ "title":"书名", "author":"作者", "intro":"一句话简介",
  "chapter1":"第一章摘要", "character":"主角外貌",
  "style":"美术风格", "location":"主要场景" }
```

解析（剥离代码围栏后 `JSON.parse`）失败给出错误提示。

## 预览与生成

`renderPreview(meta, excerpt)`：
1. 生成唯一 `bookId = 'cb_' + Date.now().toString(36)`，`anchorSpec = { character, style, location }`。
2. 若配置了 `mm_img`：先生成人物三视图 → `saveAnchorAsset(bookId,'char_turnaround')`；再生成场景背景图 → `saveAnchorAsset(bookId,'bg_scene')`；最后 `generateImage(chapter1, bookId)` 生成第一章封面（自动以三视图为参考图）。
3. 展示书名/作者/简介/锚点/第一章/封面。
4. 「确认，加入书架」→ `saveCustomBook({ id, title, author, intro, anchorSpec, chapter1, cover })` → `closeAdd()` → `renderShelf()`。
5. 「取消」→ 回到上传界面。

## 相关代码

`app.js`：`EXPERIENCE_CODE`、`isUnlocked`、`setUnlocked`、`loadCustomBooks`、`saveCustomBook`、`openAdd`、`closeAdd`、`renderAddCode`、`renderAddUpload`、`handleFile`、`generateBook`、`renderPreview`。
