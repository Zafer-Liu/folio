# 功能：沉浸对话（互动叙事引擎）

## 目标

让读者以某个「视角」进入《老人与海》，进行对话式阅读。每一回合 LLM 返回一段叙事、一个场景描述（用于配图）、3 个选项；读者可点选项或自定义输入，推动故事。强依赖 LLM，无本地降级。

## 视角（PERSONAS）

三种视角，进入对话前选择：

- `observer` 👁️ 旁观者：第三人称全知的隐形叙述者，决定叙事焦点与走向。
- `santiago` 🎣 圣地亚哥：第一人称，扮演老渔夫本人。
- `manolin` 👦 马诺林：第一人称，扮演爱着老人的男孩。

每个 persona 含 `id / pic / nm / rl / ds / persp`，其中 `persp` 拼入系统提示词，约束叙事人称与选项含义。

## 流程

1. 进入 `#view-chat` → `renderChatInit()` → `renderPersonaSelect()` 渲染 `#persona-grid`。
2. 点击视角卡 → `startStory(personaId)`：校验 LLM 配置（缺失则弹提示，不降级），初始化 `storyHistory=[{role:'system', content:buildStorySystemPrompt(persona)}]`，切到 `#story-stage`。
3. 首回合 `advanceStory('【开始】…')`：调用 LLM，渲染叙事 + 配图 + 3 选项。
4. 用户点选项或在 `#chat-text` 自定义输入 → `advanceStory(userInput)`：追加到 `storyHistory`，请求下一回合。
5. `↺ 换视角`（`restartStory()`）：清空历史、回到视角选择。

## LLM 契约

`buildStorySystemPrompt(persona)` 拼入：玩家视角 `persp` + 原著脉络（`BOOK.acts` 的标题与 summary，要求忠于主线不得杜撰）+ 任务说明。

要求模型以 `response_format: json_object` 返回：

```json
{ "narrative": "本回合叙事文本",
  "scene": "用于配图的一句场景描述",
  "choices": ["选项1", "选项2", "选项3"] }
```

`requestStoryTurn()` 发起请求；`parseStoryJSON(raw)` 做健壮解析：剥离 `<think>` / `<reasoning>` 标签、去除 markdown 代码围栏、提取首个 `{` 到末个 `}`，失败则回退为纯叙事。

## 渲染

- `addNarr(text)`：插入叙事气泡（`.msg.narr`），返回可再写内容的节点。
- 每回合在叙事上方插入插图骨架，`generateImage(turn.scene, 'oldman')` 完成后替换（见 feature-minimax / feature-anchor-assets）。
- `setChoices(arr)`：渲染 `#story-choices` 的 3 个 `.story-opt` 按钮。
- 若未静音，叙事文本经 `speakMaybe` 按当前视角音色朗读。

## 回合缓存（相同选项不再重复生成）

`advanceStory` 维护 `storyPath`（每步用户输入的数组）。缓存键 = `书 + 视角 + 归一化路径`（`storyCacheKey`），值 = `{ narrative, scene, choices, img }`，整体存于 localStorage 键 `story_cache_v1`。

- **命中缓存**：直接渲染叙事、插图、选项——零 API 调用（不请求 LLM，也不重新生成图片），剧情与配图完全一致。
- **未命中**：请求 LLM，生成插图，然后连同图片 URL 一起 `saveCachedTurn` 写入（出错的兜底轮不缓存）。
- 换视角或不同选项 → 不同路径键 → 正常走新生成。
- 开发者面板「清除剧情缓存」调用 `clearStoryCache()` 清空 `story_cache_v1`。

## 剧情质量

`buildStorySystemPrompt` 要求：4-6 句有画面感的叙述、自然引用原著台词、3 个不同倾向的选项（行动/观察/内省）、随轮次循五幕推进结局、海明威式克制文风。`requestStoryTurn` 用 `max_tokens: 900`。

## 相关代码

`app.js`：`PERSONAS`(含 voice/rate)、`renderChatInit`、`renderPersonaSelect`、`startStory`、`buildStorySystemPrompt`、`advanceStory`、`requestStoryTurn`、`parseStoryJSON`、`addNarr`、`prependImage`、`setChoices`、`restartStory`、`sendMsg`；缓存：`storyPath`、`storyCacheKey`、`loadStoryCache`、`getCachedTurn`、`saveCachedTurn`、`clearStoryCache`。
