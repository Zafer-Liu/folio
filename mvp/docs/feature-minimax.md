# 功能：MiniMax 图片与语音

所有 MiniMax 调用走 `api.minimaxi.com`，密钥仅存本地（`dev_mm_img` / `dev_mm_voice`）。T2A HTTP 无需 GroupId。

## 图片生成

端点 `POST /v1/image_generation`，模型 `image-01`。

- `generateImageRaw(prompt, aspect, subjectRef)`：底层调用。
  - body：`{ model:'image-01', prompt, aspect_ratio, n:1 }`
  - 若传 `subjectRef`（图片 URL）→ 追加 `subject_reference:[{ type:'character', image_file: subjectRef }]`，即「参考图 → 图生图」，用于人物一致性。
  - 失败（HTTP 非 2xx 或异常）：若本次带参考图，则**自动退回纯文生图**再试一次，避免整幕无图；否则返回 `null`。
  - 成功返回 `data.data.image_urls[0]`。
- `generateImage(scene, bookId)`：面向业务。
  - 取该书锚点 `getAnchors(bookId)` 与已存素材 `loadAnchorAssets(bookId)`。
  - 若已有人物三视图 `char_turnaround`，作为参考图传入 `generateImageRaw`，并在 prompt 加「严格参照参考图人物」提示。
  - 拼接 prompt：`电影分镜插画，风格。人物(+参考提示)。场景：scene。地点。电影级构图与光影，景深层次，情绪饱满，无文字水印。`，宽高比 `16:9`。

未配置图片密钥时返回 `null`，调用方跳过配图（叙事仍正常）。生成的插图会随整轮剧情写入缓存（见 feature-immersive-dialog 的「回合缓存」），相同选项路径不再重复生成。

## 语音合成（T2A）

端点 `POST /v1/t2a_v2`，模型 `speech-02-turbo`。

- `speakMaybe(text, opts)`：未配置 `mm_voice` → 降级浏览器 Web Speech（`speak(text, null, rate)`）。
- `opts = { voice, rate }`：沉浸对话按视角传入不同音色/语速——旁观者 `audiobook_male_1`(0.95)、圣地亚哥 `presenter_male`(0.88)、马诺林 `male-qn-jingying`(1.0)。缺省 `audiobook_male_1`。
- 配置后：`output_format:'hex'`，返回 `data.data.audio`（十六进制字符串）→ 转 `Uint8Array` → `Blob(audio/mp3)` → `Audio` 播放。
- `audio_setting`：mp3 / 32000 / 128000 / 单声道。
- 任意失败均降级到浏览器 TTS。
- `stopSpeak()` 同时停止 MiniMax 音频（`mmAudio.pause()` 并置空）与浏览器朗读；切换视图/静音时调用。

## 相关代码

`app.js`：`generateImage`、`generateImageRaw`、`speakMaybe`、`speak`、`stopSpeak`、`PERSONAS`(含 voice/rate)。
