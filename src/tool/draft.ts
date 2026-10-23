// 剪映草稿 JSON 生成。结构移植自 pyJianYingDraft（Apache-2.0，https://github.com/GuanYixuan/pyJianYingDraft，
// 对照版本 0.3.1，提交 1e228479dda361e312e85f6037002346cf6dca9a）：
// - assets/draft_content_template.json、assets/draft_meta_info.json 原样取自该项目 pyJianYingDraft/assets/；
// - 素材、片段、轨道的字段与取值对照 local_materials.py、segment.py、video_segment.py、audio_segment.py、
//   text_segment.py、track.py、script_material.py、script_file.py（dumps）以及 _script_file_segments.py（import_srt 的默认样式）。
// 只实现了上述源码里能确认的部分：本地视频 / 图片、本地音频（音量、淡入淡出）、模糊背景填充、普通文本字幕。
// 剪映草稿格式是逆向得来的，剪映升级后可能失效。
import contentTemplate from './assets/draft_content_template.json';
import metaTemplate from './assets/draft_meta_info.json?raw';
import { PHOTO_DURATION, type AudioPlaced, type Cue, type Placed, type Timeline } from './core';

/** 浮点数标记：序列化时整数也写成 1.0 这种形式，和 Python 生成的草稿保持一致 */
export class F {
  constructor(public v: number) {}
}
const f = (v: number) => new F(v);

type J = null | boolean | number | string | F | J[] | { [k: string]: J };

/** 按 Python json.dumps 的格式输出（indent=4、ensure_ascii=False；不缩进时用「, 」「: 」分隔） */
export function dumps(v: J, indent: number | null = 4, depth = 0): string {
  if (v === null) return 'null';
  if (v instanceof F) return Number.isInteger(v.v) ? `${v.v}.0` : String(v.v);
  if (typeof v === 'number') return String(Math.round(v));
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return JSON.stringify(v);
  const nl = indent == null ? '' : '\n' + ' '.repeat(indent * (depth + 1));
  const end = indent == null ? '' : '\n' + ' '.repeat(indent * depth);
  const sep = indent == null ? ', ' : ',';
  if (Array.isArray(v)) return v.length ? `[${v.map((x) => nl + dumps(x, indent, depth + 1)).join(sep)}${end}]` : '[]';
  const keys = Object.keys(v);
  return keys.length ? `{${keys.map((k) => `${nl}${JSON.stringify(k)}: ${dumps(v[k], indent, depth + 1)}`).join(sep)}${end}}` : '{}';
}

export const newId = () => crypto.randomUUID().replace(/-/g, '');

export interface DraftOptions {
  width: number;
  height: number;
  /** 帧率，pyJianYingDraft 默认 30 */
  fps: number;
  /** 视频原声音量 0–1 */
  videoVolume: number;
  /** 背景音乐音量 0–1 */
  bgmVolume: number;
  /** 画面比例和画布不同时的背景：模糊（剪映第一档 0.0625）或不填充 */
  blurFill: boolean;
  /** 字幕字号，pyJianYingDraft 导入 SRT 的默认值是 5 */
  subtitleSize: number;
}

const timerange = (start: number, duration: number) => ({ start, duration });

/** segment.py BaseSegment.export_json */
function baseSegment(id: string, materialId: string, start: number, duration: number) {
  return {
    enable_adjust: true,
    enable_color_correct_adjust: false,
    enable_color_curves: true,
    enable_color_match_adjust: false,
    enable_color_wheels: true,
    enable_lut: true,
    enable_smart_color_adjust: false,
    last_nonzero_volume: f(1),
    reverse: false,
    track_attribute: 0,
    track_render_index: 0,
    visible: true,
    id,
    material_id: materialId,
    target_timerange: timerange(start, duration),
    common_keyframes: [],
    keyframe_refs: [],
  } as Record<string, J>;
}

/** segment.py MediaSegment.export_json 追加的字段 */
const mediaFields = (source: { start: number; duration: number } | null, volume: number, refs: string[]) => ({
  source_timerange: source ? timerange(source.start, source.duration) : null,
  speed: f(1),
  volume: f(volume),
  extra_material_refs: refs,
  is_tone_modify: false,
});

/** segment.py ClipSettings.export_json（默认值），transform_y 可调 */
const clip = (transformY = 0) => ({
  alpha: f(1),
  flip: { horizontal: false, vertical: false },
  rotation: f(0),
  scale: { x: f(1), y: f(1) },
  transform: { x: f(0), y: f(transformY) },
});

/** segment.py Speed.export_json */
const speedJson = (id: string) => ({ curve_speed: null, id, mode: 0, speed: f(1), type: 'speed' });

/** local_materials.py CropSettings 默认（不裁剪） */
const noCrop = () => ({
  upper_left_x: f(0), upper_left_y: f(0), upper_right_x: f(1), upper_right_y: f(0),
  lower_left_x: f(0), lower_left_y: f(1), lower_right_x: f(1), lower_right_y: f(1),
});

/** local_materials.py VideoMaterial.export_json */
function videoMaterial(id: string, p: Placed) {
  const m = p.media;
  return {
    audio_fade: null,
    category_id: '',
    category_name: 'local',
    check_flag: 63487,
    crop: noCrop(),
    crop_ratio: 'free',
    crop_scale: f(1),
    duration: m.kind === 'photo' ? PHOTO_DURATION : m.duration,
    height: m.height,
    id,
    local_material_id: '',
    material_id: id,
    material_name: m.name,
    media_path: '',
    path: m.path,
    type: m.kind,
    width: m.width,
  };
}

/** local_materials.py AudioMaterial.export_json */
function audioMaterial(id: string, a: AudioPlaced['audio']) {
  return {
    app_id: 0,
    category_id: '',
    category_name: 'local',
    check_flag: 3,
    copyright_limit_type: 'none',
    duration: a.duration,
    effect_id: '',
    formula_id: '',
    id,
    local_material_id: id,
    music_id: id,
    name: a.name,
    path: a.path,
    source_platform: 0,
    type: 'extract_music',
    wave_points: [],
  };
}

/** text_segment.py TextSegment.export_material，样式取 import_srt 默认：TextStyle(size=5, align=1, auto_wrapping=True) */
function textMaterial(id: string, text: string, size: number) {
  const content = {
    styles: [
      {
        fill: { alpha: f(1), content: { render_type: 'solid', solid: { alpha: f(1), color: [f(1), f(1), f(1)] } } },
        range: [0, Array.from(text).length],
        size: f(size),
        bold: false,
        italic: false,
        underline: false,
        strokes: [],
      },
    ],
    text,
  };
  return {
    id,
    content: dumps(content, null),
    typesetting: 0,
    alignment: 1,
    letter_spacing: f(0),
    line_spacing: f(0.02),
    line_feed: 1,
    line_max_width: f(0.82),
    force_apply_line_max_width: false,
    check_flag: 7,
    type: 'subtitle',
    global_alpha: f(1),
  };
}

/** track.py Track.export_json；pyJianYingDraft 用 attribute 表示是否静音 */
const track = (type: 'video' | 'audio' | 'text', name: string, segments: J[]) => ({
  attribute: 0,
  flag: 0,
  id: newId(),
  is_default_name: name.length === 0,
  name,
  segments,
  type,
});

/** script_material.py ScriptMaterial.export_json 的全部素材桶，没用到的保持空数组 */
const MATERIAL_KEYS = [
  'ai_translates', 'audio_balances', 'audio_effects', 'audio_fades', 'audio_track_indexes', 'audios', 'beats', 'canvases', 'chromas',
  'common_mask', 'color_curves', 'digital_humans', 'drafts', 'effects', 'flowers', 'green_screens', 'handwrites', 'hsl', 'images',
  'log_color_wheels', 'loudnesses', 'manual_deformations', 'masks', 'material_animations', 'material_colors', 'multi_language_refs',
  'placeholders', 'plugin_effects', 'primary_color_wheels', 'realtime_denoises', 'shapes', 'smart_crops', 'smart_relights',
  'sound_channel_mappings', 'speeds', 'stickers', 'tail_leaders', 'text_templates', 'texts', 'time_marks', 'transitions',
  'video_effects', 'video_trackings', 'videos', 'vocal_beautifys', 'vocal_separations',
] as const;

export interface DraftFiles {
  /** draft_content.json 的内容 */
  content: string;
  /** draft_meta_info.json 的内容（pyJianYingDraft 原样复制模板，不填任何字段） */
  meta: string;
  /** 解析后的对象，测试用 */
  json: Record<string, J>;
}

/** 把时间线生成草稿文件。轨道从下到上：背景音乐、主视频、字幕（同 pyJianYingDraft demo 的顺序） */
export function buildDraft(tl: Timeline, extraCues: Cue[], opt: DraftOptions): DraftFiles {
  const mats: Record<string, J[]> = Object.fromEntries(MATERIAL_KEYS.map((k) => [k, []]));
  const tracks: { type: 'video' | 'audio' | 'text'; name: string; segments: Record<string, J>[] }[] = [];

  // 背景音乐：同一个文件循环使用时只登记一个素材
  if (tl.bgm.length) {
    const audioId = newId();
    mats.audios.push(audioMaterial(audioId, tl.bgm[0].audio));
    const segs = tl.bgm.map((b) => {
      const sp = newId();
      const refs = [sp];
      mats.speeds.push(speedJson(sp));
      if (b.fadeIn || b.fadeOut) {
        const fid = newId();
        refs.push(fid);
        mats.audio_fades.push({ id: fid, fade_in_duration: b.fadeIn, fade_out_duration: b.fadeOut, fade_type: 0, type: 'audio_fade' });
      }
      return { ...baseSegment(newId(), audioId, b.start, b.duration), ...mediaFields({ start: 0, duration: b.duration }, opt.bgmVolume, refs), clip: null, hdr_settings: null };
    });
    tracks.push({ type: 'audio', name: '背景音乐', segments: segs });
  }

  // 主视频轨：视频与图片
  const byPath = new Map<string, string>();
  const vsegs = tl.visuals.map((p) => {
    let mid = byPath.get(p.media.path);
    if (!mid) {
      mid = newId();
      byPath.set(p.media.path, mid);
      mats.videos.push(videoMaterial(mid, p));
    }
    const sp = newId();
    const refs = [sp];
    if (opt.blurFill) {
      const cid = newId();
      refs.push(cid);
      mats.canvases.push({ id: cid, type: 'canvas_blur', blur: f(0.0625), color: '#00000000', source_platform: 0 });
    }
    mats.speeds.push(speedJson(sp));
    return {
      ...baseSegment(newId(), mid, p.start, p.duration),
      ...mediaFields({ start: 0, duration: p.duration }, p.media.kind === 'video' ? opt.videoVolume : 1, refs),
      clip: clip(),
      uniform_scale: { on: true, value: f(1) },
      hdr_settings: { intensity: f(1), mode: 1, nits: 1000 },
    };
  });
  if (vsegs.length) tracks.push({ type: 'video', name: '主视频', segments: vsegs });

  // 字幕：位置同剪映导入字幕（transform_y = -0.8）
  const textTrack = (name: string, cues: Cue[]) => {
    if (!cues.length) return;
    tracks.push({
      type: 'text', name,
      segments: cues.map((c) => {
        const mid = newId();
        mats.texts.push(textMaterial(mid, c.text, opt.subtitleSize));
        // 文本片段同样带一个变速 id 引用，但 pyJianYingDraft 不把它登记进 speeds，这里保持一致
        return { ...baseSegment(newId(), mid, c.start, c.duration), ...mediaFields(null, 1, [newId()]), clip: clip(-0.8), uniform_scale: { on: true, value: f(1) } };
      }),
    });
  };
  textTrack('字幕', tl.cues);
  textTrack('整体字幕', extraCues);

  const duration = Math.max(tl.duration, ...tracks.flatMap((t) => t.segments.map((s) => {
    const r = s.target_timerange as { start: number; duration: number };
    return r.start + r.duration;
  })));

  const json = structuredClone(contentTemplate) as unknown as Record<string, J>;
  json.fps = opt.fps;
  json.duration = duration;
  (json.config as Record<string, J>).maintrack_adsorb = true;
  json.canvas_config = { width: opt.width, height: opt.height, ratio: 'original' };
  json.materials = mats;
  json.tracks = tracks.map((t, i) => ({ ...track(t.type, t.name, t.segments.map((s) => ({ ...s, render_index: i, track_render_index: 0 }))) }));
  return { content: dumps(json), meta: metaTemplate, json };
}
