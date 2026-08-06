# 活页 Folio · 让经典开口说话

> 一本会跟你对话的书。选一个视角走进《老人与海》——你可以是圣地亚哥、是马诺林、或是风浪中的旁观者。AI 驱动的互动叙事引擎，每一页都有插图、有声音、有你的选择。
>
> Eazo · Global Youth AI Agent 黑客松 参赛作品

<p align="center">
  <img src="./assets/screenshot.png" alt="活页 Folio 截图" width="800" />
</p>

---

## 🎯 赛道

**命题一：Eazo「让一本书鲜活起来」挑战**

活页 Folio 让经典文学作品从纸面"出圈"——不是简单地朗读文字，而是将整本书重塑为一个可扮演、可对话、可探索的**沉浸式 AI 叙事智能体**。读者不再是被动的旁观者，而是进入书中世界的参与者。

---

## ✨ 核心亮点

| 亮点 | 说明 |
|------|------|
| 🎭 **角色扮演叙事** | 选一个视角（旁观者 / 圣地亚哥 / 马诺林）进入故事，每回合 AI 生成叙事 + 配图 + 3 个分支选项 |
| 🖼️ **AI 实时插图** | 每段剧情自动配图，人物三视图锚定保证前后一致，支持参考图→图生图 |
| 🔊 **角色化语音** | 不同视角不同音色朗读（旁观者深沉、圣地亚哥苍老、马诺林明亮），MiniMax T2A |
| 📖 **传统阅读模式** | 分幕正文 + 脚注注释 + 段落级朗读，做有温度的阅读器 |
| 🗂️ **回合缓存** | 相同选项路径零 API 调用重放，插图自动持久化到本地 |
| 🔧 **开发者友好** | Ctrl+Shift+D 打开开发者面板，自定义 LLM / MiniMax 密钥，全部存本地不泄露 |
| 🔑 **体验码门控** | 上传自定义书籍（.txt/.docx），LLM 自动解析生成新书 |
| 📚 **书架体系** | 多书书架 + 悬停摘要 + 锚点素材管理（人物三视图 + 场景背景图） |
| 🌐 **一键部署** | Express 服务端注入环境变量，适配 Railway / Vercel 等平台 |

---

## 🏗️ 技术架构

```
dreamread/
├── index.html          # 单页应用：全部视图 + CSS + 弹窗
├── app.js              # 核心逻辑（IIFE，约 2000 行原生 JS）
├── server.js           # Express 服务端（/api/config 注入环境变量）
├── package.json        # Node.js 依赖（仅 express）
├── data/
│   ├── book-data.js    # 《老人与海》分幕内容
│   └── footnotes.js    # 术语脚注
├── assets/             # 静态插图资源
└── docs/               # 开发文档（9 篇功能详述）
```

### 技术栈

- **纯前端**：HTML + CSS + 原生 JavaScript，零构建步骤，零框架依赖
- **Express 服务端**：仅用于 `/api/config` 注入 Railway 环境变量（密钥不外泄）
- **AI 模型**：
  - 任意 OpenAI 兼容 LLM（沉浸叙事 + 书籍解析），要求 `response_format: json_object`
  - MiniMax `image-01`（插图生成 + 参考图图生图）
  - MiniMax `speech-02-turbo`（T2A 语音合成，失败自动降级浏览器 Web Speech）
- **mammoth.js**（CDN）：浏览器端解析 `.docx` 上传

### 数据流

```
┌─────────────┐     GET /api/config     ┌──────────────┐
│  Railway /   │ ◄──────────────────── │  Express      │
│  环境变量    │ ──────────────────────► │  server.js    │
└─────────────┘     JSON {llm_base,     └──────────────┘
                    llm_key, ...}              │
                                        serve static
                                              │
┌─────────────┐                              │
│  localStorage │ ◄──── 持久化 ───────────────┤
│  (dev_* 密钥  │                           │
│   进度/缓存)  │ ───────────────────────────►│
└─────────────┘                          ┌──────────┐
                                         │ index.html│
┌──────────────┐                         │ + app.js  │
│  MiniMax API │ ◄── fetch ──────────────│           │
│  图片 + 语音  │ ──────────────────────► │           │
└──────────────┘                         │           │
                                         │           │
┌──────────────┐                         │           │
│  OpenAI 兼容  │ ◄── fetch ──────────────│           │
│  LLM API     │ ──────────────────────► └──────────┘
└──────────────┘
```

### 状态持久化

| localStorage 键 | 说明 |
|-------------------|------|
| `oldman_progress_v1` | 传统阅读进度 |
| `dev_mm_img` / `dev_mm_voice` | MiniMax 密钥（仅本地） |
| `dev_llm_base` / `dev_llm_key` / `dev_llm_model` | LLM 配置（仅本地） |
| `story_cache_v1` | 回合缓存（叙事 + 图片 URL） |
| `anchor_assets` | 书籍锚点素材 |
| `custom_books` | 用户上传的自定义书 |
| `dr_accounts` / `dr_session` | 本地账户（非真实鉴权） |
| `unlocked` | 体验码解锁状态 |

---

## 🚀 快速开始

### 本地运行

```bash
cd dreamread
npm install
npm start
# 浏览器打开 http://localhost:5500
```

不需要 AI 功能时，直接打开 `index.html` 即可浏览传统阅读模式。

### 启用 AI 功能

按 `Ctrl+Shift+D` 打开开发者面板，填入：

| 字段 | 示例值 | 说明 |
|------|--------|------|
| LLM Base URL | `https://api.openai.com/v1` | OpenAI 兼容接口 |
| LLM API Key | `sk-...` | API 密钥 |
| LLM Model | `gpt-4o-mini` | 需支持 json_object |
| MiniMax 图片 Key | `sk-...` | 插图生成（可选） |
| MiniMax 语音 Key | `sk-...` | 角色化朗读（可选，缺失时降级浏览器 TTS） |

所有密钥仅存于浏览器 `localStorage`，不上传服务器。

### 部署到 Railway

```bash
cd dreamread
npx railway link -p <project> -s <service>
npx railway up
```

环境变量在 Railway Dashboard 中设置（或用 `railway variables set`）：

```
LLM_BASE_URL  = https://api.openai.com/v1
LLM_API_KEY   = sk-...
LLM_MODEL     = gpt-4o-mini
MM_IMG_KEY    = sk-...    (或 - 占位)
MM_VOICE_KEY  = sk-...    (或 - 占位)
```

---

## 📖 使用指南

### 传统阅读
1. 首页点击「传统阅读」→ 选择「老人与海」
2. 左侧幕次列表导航，右侧正文阅读
3. 点击文中标记查看注释，点朗读按钮听书

### 沉浸对话
1. 首页点击「沉浸对话」→ 选择「老人与海」
2. 选择视角：旁观者 / 圣地亚哥 / 马诺林
3. 每回合 AI 生成：一段叙事 + 一幅插图 + 3 个选项
4. 点击预设话题或输入自定义内容推动剧情
5. 相同选择路径自动缓存，再次探索零延迟

### 自定义书籍
1. 书架上点击「＋」或进入「账户」页
2. 输入体验码 `666` 解锁
3. 上传 .txt 或 .docx 文件
4. LLM 自动解析生成：书名、作者、简介、分章摘要
5. 确认后出现在书架上

---

## 🧪 评分契合度

| 评分维度 | 活页 Folio 的实现 |
|-----------|-------------------|
| **动态测评 — 技术连通性** | Express `/api/config` 注入环境变量，LLM + MiniMax 双 API 全链路联通，回合缓存命中时零 API 调用 |
| **动态测评 — 交付性验证** | `npm start` 一键启动，Railway 生产环境在线运行 |
| **静态测评 — 功能完成度** | 4 个核心模块完成：书架 + 分幕阅读 + 沉浸对话 + 自定义上传，9 篇功能文档 |
| **静态测评 — 工程质量** | 代码结构清晰（IIFE 封装 / 单页多视图 / 数据与逻辑分离），`window.app` 暴露 20+ 接口，缓存策略完备 |
| **静态测评 — 技术深度** | 回合缓存（相同路径零 API 调用）、参考图→图生图人物一致性、锚点素材体系、体验码门控全链路、多音色语音降级 |

---

## 📄 许可证

MIT License

---

## 👥 团队

提交团队名及成员信息（待补充）。

---

<p align="center">
  <sub>Built with ❤️ for Eazo Global Youth AI Agent Hackathon 2026</sub>
</p>
