# 功能：开发者模式

## 进入

全局快捷键 `Ctrl+Shift+D` 打开 `#dev-mask` 面板。`openDev()` 回填当前配置并渲染锚点区，`closeDev()` 关闭（点遮罩或 ✕）。

## 配置项

| 分组 | 字段 | localStorage 键 |
|------|------|-----------------|
| MiniMax 图片 | Image Key | `dev_mm_img` |
| MiniMax 语音 | Voice Key | `dev_mm_voice` |
| LLM | BaseURL / API Key / Model | `dev_llm_base` / `dev_llm_key` / `dev_llm_model` |

`saveDev()` 逐项 `setCfg` 写入（`dev_` 前缀），显示「✓ 已保存」。所有密钥仅存本地浏览器，不上传。

## 锚点资产区

面板底部含：`#anchor-book` 选书下拉、`#anchor-grid` 素材网格、「生成锚点资产」按钮、`#anchor-status` 状态条。详见 [feature-anchor-assets.md](./feature-anchor-assets.md)。

## 相关代码

`app.js`：快捷键监听、`openDev`、`closeDev`、`saveDev`、`getCfg`、`setCfg`。
`index.html`：`#dev-mask` 面板结构。
