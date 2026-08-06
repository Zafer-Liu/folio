# 功能：锚点资产（人物三视图 + 场景背景图）

## 目标

为每本书预生成一组「视觉锚点」——人物三视图与场景背景图——作为后续所有插图的视觉基准，保证同一本书的人物长相、发须、服装与场景风格前后一致。

## 按书绑定

素材以书为单位存储在 `localStorage` 键 `anchor_assets`：

```json
{ "oldman": { "char_turnaround": "https://…", "bg_scene": "https://…" },
  "cb_xxx": { "char_turnaround": "…" } }
```

访问器：`loadAllAnchors()`、`loadAnchorAssets(bookId)`、`saveAnchorAsset(bookId, key, url)`。`devBookId` 记录开发者面板/素材弹窗当前操作的书。

## 规格（ANCHOR_SPECS）

```js
ANCHOR_SPECS = [
  { key:'char_turnaround', cap:'人物三视图',
    prompt:(a)=>`角色设定三视图…正面/侧面/背面并排…白色背景，全身。人物：${a.character}。风格：${a.style}。` },
  { key:'bg_scene', cap:'场景背景图',
    prompt:(a)=>`…空镜背景…${a.location}。风格：${a.style}。` },
]
```

`a` 即 `getAnchors(bookId)` 返回的 `{ character, style, location }`。

## 生成

`genAnchors()`：
1. 校验 `mm_img` 密钥（缺失则在 `#anchor-status` 提示）。
2. 对每个 spec 调 `generateImageRaw(prompt, aspect)` 生成图片。
3. 成功即 `saveAnchorAsset(devBookId, key, url)`，并刷新网格。
4. 汇总成功数写入状态条。

生成三视图后，后续 `generateImage` 会把它作为参考图（图生图），实现人物一致性。

## 查看/生成入口

- 开发者面板：`#anchor-book` 下拉选书（`renderAnchorBookSelect()`）→ `#anchor-grid` 显示该书素材（`renderAnchorGrid()`）→「生成锚点资产」按钮。
- 书架悬停「🎨 查看素材」→ `openAssets(bookId)`（复用 add-mask 弹窗）：
  - 显示该书两类素材（有图显示图，无图显示「未生成」占位）。
  - **已解锁**（`isUnlocked()`）用户显示「生成 / 重新生成素材」按钮；生成走 `genAnchors()` 后刷新弹窗。
  - **未解锁**用户仅可查看，显示「🔒 生成自定义素材需要体验码解锁」。

## 相关代码

`app.js`：`ANCHOR_SPECS`、`devBookId`、`loadAllAnchors`、`loadAnchorAssets`、`saveAnchorAsset`、`readableBooks`、`renderAnchorBookSelect`、`renderAnchorGrid`、`genAnchors`、`openAssets`、`getAnchors`。
