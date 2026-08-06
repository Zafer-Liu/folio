# 功能：传统分幕阅读

## 目标

以「幕次」为单位阅读《老人与海》，支持脚注注释、段落级朗读、阅读进度记忆。

## 数据

- `BOOK`（`data/book-data.js`）：`{ title, author, acts:[{ id, title, summary, paras:[…] }] }`
- 脚注（`data/footnotes.js`）：术语/典故注释，正文中以标记引用。

## 视图与交互

`#view-acts`：左侧幕次导航 + 右侧正文。

- `openAct(id)`：渲染指定幕，高亮导航，写入阅读进度。
- `nextAct()`：进入下一幕。
- 幕次导航高亮跟随当前幕；已读幕显示进度徽章。

## 段落朗读

- `speakAct()`：朗读整幕。
- `speakFromPara(idx)`：从某段开始朗读（段落工具栏）。
- `stopSpeak()`：停止。
- 底层 `speak(text)`：默认浏览器 Web Speech；若配置了 MiniMax 语音，`speakMaybe` 走 MiniMax T2A（见 feature-minimax）。
- 切换视图时自动 `stopSpeak()`，避免朗读串场。

## 脚注

正文中的脚注标记可点击，弹出对应注释；再次点击或点其他处关闭。

## 阅读进度

进度存于 `localStorage` 键 `oldman_progress_v1`。封面/书籍详情提供「续读」按钮跳到最近幕次。

## 相关代码

`app.js`：`openAct`、`nextAct`、`speakAct`、`speakFromPara`、`stopSpeak`、`speak`、进度读写逻辑。
