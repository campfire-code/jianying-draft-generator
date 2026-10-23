# 第三方开源组件

本工具使用了以下开源组件，许可证原文见各项目仓库。

| 组件 | 用途 | 许可证 |
|---|---|---|
| [Tauri](https://github.com/tauri-apps/tauri) 及官方插件 | 桌面应用框架 | MIT / Apache-2.0 |
| [React](https://github.com/facebook/react) | 界面 | MIT |
| [Lucide](https://github.com/lucide-icons/lucide) | 图标 | ISC |
| [Vite](https://github.com/vitejs/vite) | 构建 | MIT |

## 草稿格式来源

剪映草稿格式没有官方文档，本工具的字段结构和两份模板文件取自：

- [GuanYixuan/pyJianYingDraft](https://github.com/GuanYixuan/pyJianYingDraft)，许可证 Apache-2.0（`gh api` 核实 spdx_id 为 Apache-2.0），对照提交 `1e228479dda361e312e85f6037002346cf6dca9a`（2026-10-14）。
- `src/tool/assets/draft_content_template.json`、`src/tool/assets/draft_meta_info.json` 与该提交的 `pyJianYingDraft/assets/` 同名文件逐字节一致（已用 cmp 核对）。
- `src/tool/draft.ts` 是对其 `local_materials.py`、`segment.py`、`video_segment.py`、`audio_segment.py`、`text_segment.py`、`track.py`、`script_material.py`、`script_file.py` 输出结构的 TypeScript 重新实现，已在文件头注明；对上游内容的修改（改写为 TypeScript、只保留本地视频 / 图片 / 音频 / 文本字幕部分）见该文件。
- 上游许可证原文：`licenses/pyJianYingDraft-LICENSE.txt`。上游仓库没有 NOTICE 文件。
