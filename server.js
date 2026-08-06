const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5500;

// --- Volume-backed asset storage ---
const ASSETS_DIR = process.env.ASSETS_DIR || path.join(__dirname, 'data', 'assets');

function ensureAssetsDir() {
  try { fs.mkdirSync(ASSETS_DIR, { recursive: true }); } catch (e) { /* exists */ }
}
ensureAssetsDir();

// Helpers for env-based config
const env = (k) => {
  const val = process.env[k];
  if (val === '-' || val === undefined || val === '') return '';
  return val;
};
const llmBase  = () => env('LLM_BASE_URL');
const llmKey   = () => env('LLM_API_KEY');
const llmModel = () => env('LLM_MODEL');
const mmImg    = () => env('MM_IMG_KEY');
const mmVoice  = () => env('MM_VOICE_KEY');

// ========================
//  API Routes (frontend)
// ========================

// POST /api/asset — persist an external image to volume
app.post('/api/asset', express.json({ limit: '2mb' }), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' });
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const ext = url.match(/\.(png|jpg|jpeg|webp)(\?|$)/i)?.[1] || 'png';
    const filename = hash + '.' + ext;
    const filepath = path.join(ASSETS_DIR, filename);
    if (fs.existsSync(filepath)) {
      return res.json({ id: filename, url: '/api/asset/' + filename, cached: true });
    }
    const resp = await fetch(url);
    if (!resp.ok) return res.status(502).json({ error: 'download failed', status: resp.status });
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(filepath, buf);
    console.log('[asset] stored ' + filename + ' (' + (buf.length / 1024).toFixed(1) + ' KB)');
    res.json({ id: filename, url: '/api/asset/' + filename, cached: false });
  } catch (e) {
    console.error('[asset] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/asset/:id — serve stored assets
app.get('/api/asset/:id', (req, res) => {
  const filepath = path.join(ASSETS_DIR, req.params.id);
  if (!filepath.startsWith(ASSETS_DIR)) return res.status(403).end();
  if (!fs.existsSync(filepath)) return res.status(404).end();
  res.sendFile(filepath);
});

// GET /api/config — expose secrets for frontend
app.get('/api/config', (_req, res) => {
  res.json({
    llm_base:  env('LLM_BASE_URL'),
    llm_key:   env('LLM_API_KEY'),
    llm_model: env('LLM_MODEL'),
    mm_img:    env('MM_IMG_KEY'),
    mm_voice:  env('MM_VOICE_KEY')
  });
});

// ========================
//  MCP Server (POST /mcp)
//  Streamable HTTP · protocol 2026-07-28
// ========================

const MCP_PROTOCOL_VERSION = '2026-07-28';

// --- MCP Tool definitions ---
const MCP_TOOLS = [
  {
    name: 'folio_narrate',
    description: 'Generate the next turn of an interactive narrative set in Hemingway\'s "The Old Man and the Sea". You choose a persona (observer / santiago / manolin), provide the player\'s action or dialogue, and the agent returns a cinematic literary passage, a scene description for illustration, and three branching choices. This is the core interactive-storytelling engine of 活页 Folio.',
    inputSchema: {
      type: 'object',
      properties: {
        persona: {
          type: 'string',
          enum: ['observer', 'santiago', 'manolin'],
          description: 'The narrative perspective. observer = third-person omniscient narrator, santiago = first-person as the old fisherman, manolin = first-person as the boy.'
        },
        player_action: {
          type: 'string',
          description: 'What the player says or does this turn (e.g. "你为什么坚持出海？" or "我拉紧鱼线，手臂开始抽筋").'
        },
        history_summary: {
          type: 'string',
          description: 'Brief summary of the story so far, so the agent knows what has already happened. Omit on the very first turn.'
        }
      },
      required: ['persona', 'player_action']
    }
  },
  {
    name: 'folio_illustrate',
    description: 'Generate a cinematic illustration for a scene from the narrative, using MiniMax image-01. Returns a persistent image URL backed by Railway volume storage — the image will not expire even if the upstream CDN link does.',
    inputSchema: {
      type: 'object',
      properties: {
        scene_description: {
          type: 'string',
          description: 'One-sentence scene description in Chinese or English, e.g. "老人在月光下划着小船，湾流深蓝如墨".'
        },
        style: {
          type: 'string',
          description: 'Optional style override. Defaults to cinematic oil-painting style with warm golden tones.',
          default: '电影感写实油画，暖金色调，加勒比海日落逆光，胶片颗粒质感'
        }
      },
      required: ['scene_description']
    }
  },
  {
    name: 'folio_speak',
    description: 'Synthesize speech from text using MiniMax T2A, returning hex-encoded MP3 audio. Supports per-persona voice presets for immersive audio narration.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to synthesize into speech (Chinese and/or English).'
        },
        voice: {
          type: 'string',
          enum: ['audiobook_male_1', 'presenter_male', 'male-qn-jingying'],
          description: 'Voice preset. audiobook_male_1 = deep narrator (observer), presenter_male = weathered old man (santiago), male-qn-jingying = bright young voice (manolin).',
          default: 'audiobook_male_1'
        }
      },
      required: ['text']
    }
  }
];

// --- JSON-RPC helpers ---
function jsonRpcError(id, code, message, data) {
  const err = { code, message };
  if (data) err.data = data;
  return { jsonrpc: '2.0', id: id ?? null, error: err };
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function validateMCPHeaders(req) {
  const errors = [];
  const protoVersion = req.headers['mcp-protocol-version'];
  if (!protoVersion) {
    errors.push('Missing MCP-Protocol-Version header');
  } else if (protoVersion !== MCP_PROTOCOL_VERSION) {
    errors.push(`Unsupported protocol version: ${protoVersion}. Supported: ${MCP_PROTOCOL_VERSION}`);
  }
  const method = req.headers['mcp-method'];
  if (!method) errors.push('Missing Mcp-Method header');
  return errors;
}

// --- MCP endpoint ---
app.post('/mcp', express.json({ limit: '1mb' }), async (req, res) => {
  const body = req.body;

  // Minimal JSON-RPC envelope check
  if (!body || body.jsonrpc !== '2.0') {
    return res.status(400).json(jsonRpcError(null, -32600, 'Invalid Request: jsonrpc must be "2.0"'));
  }

  const { method, params, id } = body;

  // Validate Streamable HTTP headers
  const headerErrors = validateMCPHeaders(req);
  if (headerErrors.length > 0) {
    return res.status(400).json(jsonRpcError(id, -32020, 'Header mismatch: ' + headerErrors.join('; ')));
  }

  // Verify Mcp-Method header matches body
  const headerMethod = req.headers['mcp-method'];
  if (headerMethod !== method) {
    return res.status(400).json(jsonRpcError(id, -32020,
      `Header mismatch: Mcp-Method header '${headerMethod}' does not match body method '${method}'`));
  }

  try {
    switch (method) {
      // --- Lifecycle ---
      case 'initialize': {
        const result = {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: {
            name: '活页 Folio MCP',
            version: '1.0.0'
          }
        };
        return res.json(jsonRpcResult(id, result));
      }

      case 'notifications/initialized':
        // No response body for notifications per 2026 spec — but we return 202
        return res.status(202).end();

      // --- Discovery ---
      case 'tools/list': {
        return res.json(jsonRpcResult(id, { tools: MCP_TOOLS }));
      }

      // --- Invocation ---
      case 'tools/call': {
        const toolName = params?.name;
        // Validate Mcp-Name header
        const headerName = req.headers['mcp-name'];
        if (headerName !== toolName) {
          return res.status(400).json(jsonRpcError(id, -32020,
            `Header mismatch: Mcp-Name header '${headerName}' does not match body name '${toolName}'`));
        }

        const args = params?.arguments || {};

        switch (toolName) {
          case 'folio_narrate': {
            // ---- Build the storytelling prompt ----
            const personaId = args.persona || 'observer';
            const playerAction = args.player_action || '';
            const historySummary = args.history_summary || '';

            const PERSONAS = {
              observer: { nm: '旁观者', persp: '你是一个全知第三人称的叙述者。你俯瞰整个故事，决定叙事的焦点和节奏。你像海明威一样写作：克制的句子，精确的细节，内在的张力。' },
              santiago: { nm: '圣地亚哥', persp: '你是圣地亚哥，古巴老渔夫。你以第一人称讲述自己的故事。你说话简洁，话里带着海风和汗水的咸涩，骨子里透着不认输的骄傲。你只知道自己亲眼所见、亲手所感的事。' },
              manolin: { nm: '马诺林', persp: '你是马诺林，深爱着老人的男孩。你以第一人称讲述，你的话语里充满对老人的关切和担忧。你的视角更年轻、更细腻，留意到成年人忽略的细节。' }
            };

            const p = PERSONAS[personaId] || PERSONAS.observer;

            const systemPrompt = `你是一个互动叙事引擎，正在运行《老人与海》的沉浸式文学体验。
视角：${p.nm}。${p.persp}

原著脉络（五幕结构，故事必须沿此推进）：
第一幕·出海：老人84天没捕到鱼，男孩马诺林被迫离开他，老人独自出海。
第二幕·搏斗：老人钓到一条比船还长的大马林鱼，与之搏斗三天三夜。
第三幕·征服：老人终于杀死大鱼，将它绑在船边，开始返航。
第四幕·鲨群：鲨鱼循血而来，一条接一条啃食大鱼的肉。老人用鱼叉、用桨与之搏斗。
第五幕·归航：老人带回一副巨大鱼骨架，精疲力尽倒在床铺上。男孩守着他。

${historySummary ? '已发生的剧情：' + historySummary : '这是第一回合，故事从出海前开始。'}

玩家刚刚的选择/输入：「${playerAction}」

请以 JSON 格式返回下一回合内容：
{
  "narrative": "4-6句话的叙事段落，文学性强，有画面感。可自然引用原著中的台词。海明威式的克制笔法。",
  "scene": "一句场景描述，用于配图生成（中文，侧重光线、构图、情绪）。",
  "choices": ["选项1（行动导向）", "选项2（观察导向）", "选项3（内省导向）"]
}

要求：
- 三个选项的倾向各不相同（行动/观察/内省），提供真正不同的叙事路径。
- 随回合数推进，故事需向下一幕靠拢。
- 叙事忠于原著精神，不杜撰主要情节。`;

            if (!llmKey() || !llmBase()) {
              return res.json(jsonRpcResult(id, {
                content: [{ type: 'text', text: 'LLM 未配置。请设置 LLM_API_KEY 和 LLM_BASE_URL 环境变量。' }],
                isError: true
              }));
            }

            try {
              const llmResp = await fetch(llmBase() + '/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + llmKey() },
                body: JSON.stringify({
                  model: llmModel() || 'abab7',
                  messages: [{ role: 'system', content: systemPrompt }],
                  response_format: { type: 'json_object' },
                  max_tokens: 900,
                  temperature: 0.85
                })
              });

              if (!llmResp.ok) {
                const errText = await llmResp.text();
                return res.json(jsonRpcResult(id, {
                  content: [{ type: 'text', text: `LLM 调用失败 (${llmResp.status}): ${errText.slice(0, 300)}` }],
                  isError: true
                }));
              }

              const data = await llmResp.json();
              const raw = data?.choices?.[0]?.message?.content || '';
              // Parse JSON from LLM (strip markdown fences, think tags)
              let parsed;
              try {
                const cleaned = raw.replace(/<think[\s\S]*?<\/think>/gi, '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
                const start = cleaned.indexOf('{');
                const end = cleaned.lastIndexOf('}');
                parsed = (start >= 0 && end > start) ? JSON.parse(cleaned.slice(start, end + 1)) : { narrative: raw, scene: '', choices: [] };
              } catch (e) {
                parsed = { narrative: raw, scene: '', choices: [] };
              }

              return res.json(jsonRpcResult(id, {
                content: [
                  { type: 'text', text: JSON.stringify(parsed, null, 2) }
                ]
              }));
            } catch (e) {
              return res.json(jsonRpcResult(id, {
                content: [{ type: 'text', text: `叙事引擎异常: ${e.message}` }],
                isError: true
              }));
            }
          }

          case 'folio_illustrate': {
            const scene = args.scene_description || '';
            const style = args.style || '电影感写实油画，暖金色调，加勒比海日落逆光，胶片颗粒质感';
            const characterAnchor = '古巴老渔夫圣地亚哥，消瘦憔悴，深褐色皮肤，白发白须，眼睛像海水一样蓝，穿褪色打补丁的衬衫';
            const locationAnchor = '1950年代古巴哈瓦那湾外海，破旧小木帆船，湾流';

            if (!mmImg()) {
              return res.json(jsonRpcResult(id, {
                content: [{ type: 'text', text: 'MiniMax 图片密钥未配置。请设置 MM_IMG_KEY 环境变量。' }],
                isError: true
              }));
            }

            const fullPrompt = `电影分镜插画，${style}。${characterAnchor}。场景：${scene}。${locationAnchor}。电影级构图与光影，景深层次，情绪饱满，细腻笔触，无文字水印。`;

            try {
              const imgResp = await fetch('https://api.minimaxi.com/v1/image_generation', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + mmImg(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'image-01', prompt: fullPrompt, aspect_ratio: '16:9', n: 1 })
              });

              if (!imgResp.ok) {
                return res.json(jsonRpcResult(id, {
                  content: [{ type: 'text', text: `图片生成失败 (${imgResp.status})` }],
                  isError: true
                }));
              }

              const imgData = await imgResp.json();
              const rawUrl = imgData?.data?.image_urls?.[0] || null;
              if (!rawUrl) {
                return res.json(jsonRpcResult(id, {
                  content: [{ type: 'text', text: '图片生成成功但未返回 URL' }],
                  isError: true
                }));
              }

              // Persist to volume so the URL survives CDN expiry
              let persistentUrl = rawUrl;
              try {
                const hash = crypto.createHash('md5').update(rawUrl).digest('hex');
                const ext = rawUrl.match(/\.(png|jpg|jpeg|webp)(\?|$)/i)?.[1] || 'png';
                const filename = hash + '.' + ext;
                const filepath = path.join(ASSETS_DIR, filename);
                if (!fs.existsSync(filepath)) {
                  const dl = await fetch(rawUrl);
                  if (dl.ok) {
                    const buf = Buffer.from(await dl.arrayBuffer());
                    fs.writeFileSync(filepath, buf);
                    console.log('[mcp] persisted image ' + filename);
                  }
                }
                persistentUrl = '/api/asset/' + filename;
              } catch (e) {
                console.warn('[mcp] image persistence failed, using raw URL:', e.message);
                persistentUrl = rawUrl;
              }

              return res.json(jsonRpcResult(id, {
                content: [
                  { type: 'text', text: persistentUrl },
                  { type: 'image', data: persistentUrl, mimeType: 'image/png' }
                ]
              }));
            } catch (e) {
              return res.json(jsonRpcResult(id, {
                content: [{ type: 'text', text: `图片引擎异常: ${e.message}` }],
                isError: true
              }));
            }
          }

          case 'folio_speak': {
            const text = args.text || '';
            const voice = args.voice || 'audiobook_male_1';

            if (!mmVoice()) {
              return res.json(jsonRpcResult(id, {
                content: [{ type: 'text', text: 'MiniMax 语音密钥未配置。请设置 MM_VOICE_KEY 环境变量。' }],
                isError: true
              }));
            }

            try {
              const ttsResp = await fetch('https://api.minimaxi.com/v1/t2a_v2', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + mmVoice(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'speech-02-turbo',
                  text: text,
                  stream: false,
                  voice_setting: { voice_id: voice, speed: 1.0, vol: 1.0 },
                  audio_setting: { format: 'mp3', sample_rate: 32000, bitrate: 128000, channel: 1 },
                  output_format: 'hex'
                })
              });

              if (!ttsResp.ok) {
                return res.json(jsonRpcResult(id, {
                  content: [{ type: 'text', text: `语音合成失败 (${ttsResp.status})` }],
                  isError: true
                }));
              }

              const ttsData = await ttsResp.json();
              const hex = ttsData?.data?.audio || '';
              const audioLen = hex ? hex.length / 2 : 0;

              return res.json(jsonRpcResult(id, {
                content: [
                  { type: 'text', text: `语音合成成功。音频长度: ${(audioLen / 1024).toFixed(1)} KB (hex MP3, ${voice})` }
                ]
              }));
            } catch (e) {
              return res.json(jsonRpcResult(id, {
                content: [{ type: 'text', text: `语音引擎异常: ${e.message}` }],
                isError: true
              }));
            }
          }

          default:
            return res.status(404).json(jsonRpcError(id, -32601, `Method not found: ${toolName}`));
        }
      }

      // --- Ping (non-standard, helpful for health checks) ---
      case 'ping': {
        return res.json(jsonRpcResult(id, { ok: true }));
      }

      default:
        return res.status(404).json(jsonRpcError(id, -32601, `Method not found: ${method}`));
    }
  } catch (e) {
    console.error('[mcp] internal error:', e);
    return res.status(500).json(jsonRpcError(id, -32603, 'Internal error: ' + e.message));
  }
});

// ========================
//  Static & SPA fallback
// ========================

app.use(express.static(path.join(__dirname, 'dreamread')));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    agent: '活页 Folio · 让经典开口说话',
    mcp: `/mcp (protocol ${MCP_PROTOCOL_VERSION})`,
    tools: MCP_TOOLS.map(t => t.name)
  });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dreamread', 'index.html'));
});

// ========================
//  Start
// ========================

app.listen(PORT, () => {
  console.log('活页 Folio on port ' + PORT);
  console.log('[mcp]  endpoint: /mcp  (protocol ' + MCP_PROTOCOL_VERSION + ')');
  console.log('[mcp]  tools:   ' + MCP_TOOLS.map(t => t.name).join(', '));
  console.log('[asset] dir:    ' + ASSETS_DIR);
});
