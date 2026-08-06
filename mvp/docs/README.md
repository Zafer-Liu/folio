# Dreamread 开发文档

> Dreamread · 让经典鲜活起来 —— 一个纯前端的「互动阅读」MVP。
> 以《老人与海》为首个内容，支持传统分幕阅读、AI 沉浸式角色扮演对话、MiniMax 图片/语音生成、自定义书籍上传。

## 文档索引

| 文档 | 内容 |
|------|------|
| [architecture.md](./architecture.md) | 项目整体架构、目录结构、运行方式、数据/状态模型 |
| [feature-bookshelf.md](./feature-bookshelf.md) | 书架封面、导航页、书籍卡片、悬停摘要与「查看素材」 |
| [feature-reading.md](./feature-reading.md) | 传统分幕阅读、脚注、段落朗读、阅读进度 |
| [feature-immersive-dialog.md](./feature-immersive-dialog.md) | 沉浸对话（角色扮演互动叙事引擎、视角、选项） |
| [feature-minimax.md](./feature-minimax.md) | MiniMax 图片生成、参考图→图生图、T2A 语音合成 |
| [feature-anchor-assets.md](./feature-anchor-assets.md) | 锚点资产（人物三视图 + 场景背景图，按书绑定） |
| [feature-dev-panel.md](./feature-dev-panel.md) | 开发者模式（Ctrl+Shift+D）与本地配置 |
| [feature-custom-books.md](./feature-custom-books.md) | 体验码门控、上传书籍、LLM 解析生成 |
| [feature-account.md](./feature-account.md) | 账户注册 / 登录、个人信息配置、体验码解锁 |

## 快速开始

```bash
npx serve -p 5500 mvp
# 浏览器打开 http://localhost:5500
```

需要 AI 能力（沉浸对话、图片、语音、自定义书籍）时，按 `Ctrl+Shift+D` 打开开发者模式，填入 MiniMax 与 LLM（OpenAI 兼容）密钥。所有密钥仅存本地浏览器 `localStorage`，不上传。

## 技术栈

- 纯前端：HTML + CSS + 原生 JavaScript（无构建步骤）
- `app.js` 使用 IIFE，对外只暴露 `window.app`
- 第三方：[mammoth.js](https://github.com/mwilliamson/mammoth.js)（CDN，解析 .docx）
- 外部服务：MiniMax（图片 `image-01` / 语音 `speech-02-turbo`）、任意 OpenAI 兼容 LLM

## 体验码

内置体验码 `666`。用于解锁「上传自定义书籍」与「生成自定义锚点素材」。未解锁用户仍可查看已生成的素材。
