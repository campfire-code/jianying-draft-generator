// 纯函数：时间换算、字幕解析、时间线拼接、文件名与容器解析，不依赖界面和本机能力。
// 时间一律用微秒（与剪映草稿和 pyJianYingDraft 一致：1 秒 = 1,000,000 微秒）。

export const SEC = 1_000_000;

/** 秒 → 微秒（四舍五入到整数微秒） */
export const sec = (s: number) => Math.round(s * SEC);

/** 微秒 → 便于阅读的「12.3 秒」 */
export const fmtSec = (us: number) => `${(us / SEC).toFixed(us % SEC === 0 ? 0 : 1)} 秒`;

/** pyJianYingDraft 给图片素材写的时长：10800000000 微秒（相当于 3 小时） */
export const PHOTO_DURATION = 10_800_000_000;

export const VIDEO_EXT = ['mp4', 'mov'];
export const IMAGE_EXT = ['jpg', 'jpeg', 'png'];
export const AUDIO_EXT = ['mp3', 'wav'];

export const extOf = (name: string) => (/\.([^.\\/]+)$/.exec(name)?.[1] ?? '').toLowerCase();
export const baseName = (name: string) => name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
export const dirOf = (path: string) => path.replace(/[\\/][^\\/]*$/, '');
export const kindOf = (name: string): 'video' | 'photo' | null => {
  const e = extOf(name);
  return VIDEO_EXT.includes(e) ? 'video' : IMAGE_EXT.includes(e) ? 'photo' : null;
};

/** 草稿名（即草稿文件夹名）：去掉文件名里不允许的字符 */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '') || '未命名草稿';

/** 自然排序：「片段2」排在「片段10」前面 */
export const naturalCompare = (a: string, b: string) => a.localeCompare(b, 'zh-CN', { numeric: true });

// ---------------- 字幕 ----------------

export interface Cue { start: number; duration: number; text: string }

/** SRT 时间戳 00:01:02,345 → 微秒（同 pyJianYingDraft 的 srt_tstamp，额外容忍小数点写法） */
export function srtStamp(s: string): number {
  const m = /^\s*(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*$/.exec(s);
  if (!m) throw new Error(`字幕时间格式不对：「${s.trim()}」`);
  return ((+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000 + +m[4].padEnd(3, '0')) * 1000;
}

/** 解析 SRT：序号行、时间行、若干内容行、空行。多行内容用换行连接。 */
export function parseSrt(text: string): Cue[] {
  const out: Cue[] = [];
  const blocks = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  for (const b of blocks) {
    const lines = b.split('\n').map((l) => l.trim());
    while (lines.length && !lines[0]) lines.shift();
    if (!lines.length) continue;
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) throw new Error(`字幕文件格式不对，这一段找不到时间行：「${lines[0].slice(0, 30)}」`);
    const [a, z] = lines[ti].split('-->');
    const start = srtStamp(a);
    const end = srtStamp(z.trim().split(/\s+/)[0]);
    const body = lines.slice(ti + 1).filter(Boolean).join('\n');
    if (body && end > start) out.push({ start, duration: end - start, text: body });
  }
  return out;
}

/**
 * 文本字幕：每行一条，平均分配到 [start, start+duration] 这段时间。
 * 相邻两条共用同一个边界，避免取整后出现缝隙或重叠。
 */
export function spreadLines(text: string, start: number, duration: number): Cue[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length || duration <= 0) return [];
  const edge = (i: number) => start + Math.round((duration * i) / lines.length);
  return lines.map((t, i) => ({ start: edge(i), duration: edge(i + 1) - edge(i), text: t }));
}

/** 同一条字幕轨上片段不能重叠（pyJianYingDraft 会报错），按开始时间排好，前一条截到后一条开始处 */
export function tidyCues(cues: Cue[]): Cue[] {
  const s = [...cues].sort((a, b) => a.start - b.start);
  const out: Cue[] = [];
  for (const c of s) {
    const prev = out[out.length - 1];
    if (prev && prev.start + prev.duration > c.start) {
      prev.duration = c.start - prev.start;
      if (prev.duration <= 0) out.pop();
    }
    if (c.duration > 0) out.push({ ...c });
  }
  return out;
}

/** 读字幕文件：先按 UTF-8，不合法再按 GBK（Windows 上常见） */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('gbk').decode(bytes);
  }
}

// ---------------- 时间线 ----------------

export interface MediaInfo {
  path: string;
  name: string;
  kind: 'video' | 'photo';
  /** 素材时长（微秒）；图片为 0，由规则决定上屏时长 */
  duration: number;
  width: number;
  height: number;
  /** 与素材同名的字幕，时间相对于素材开头 */
  subs?: Cue[];
  /** 同名 .txt 的原文，按片段时长平均分配 */
  subText?: string;
}
export interface AudioInfo { path: string; name: string; duration: number }

export interface Placed { media: MediaInfo; start: number; duration: number }
export interface AudioPlaced { audio: AudioInfo; start: number; duration: number; fadeIn: number; fadeOut: number }

export interface Timeline {
  visuals: Placed[];
  /** 跟随各素材的字幕（绝对时间） */
  cues: Cue[];
  bgm: AudioPlaced[];
  duration: number;
}

export interface TimelineOptions {
  /** 每张图片停留的时长（微秒） */
  imageDuration: number;
  bgm?: AudioInfo | null;
  /** 背景音乐比画面短时是否循环 */
  bgmLoop: boolean;
  /** 淡入淡出时长（微秒） */
  bgmFade: number;
}

/** 素材按顺序首尾相接放在主轨上；字幕跟着各自素材平移；背景音乐铺满（或循环铺满）整段画面 */
export function buildTimeline(medias: MediaInfo[], opt: TimelineOptions): Timeline {
  let t = 0;
  const visuals: Placed[] = [];
  const cues: Cue[] = [];
  for (const m of medias) {
    const d = m.kind === 'photo' ? opt.imageDuration : m.duration;
    if (d <= 0) throw new Error(`「${m.name}」读不到时长`);
    visuals.push({ media: m, start: t, duration: d });
    for (const c of m.subs ?? []) {
      if (c.start >= d) continue; // 超出素材长度的字幕丢掉
      cues.push({ start: t + c.start, duration: Math.min(c.duration, d - c.start), text: c.text });
    }
    if (m.subText) cues.push(...spreadLines(m.subText, t, d));
    t += d;
  }
  const bgm: AudioPlaced[] = [];
  if (opt.bgm && opt.bgm.duration > 0 && t > 0) {
    let s = 0;
    do {
      const d = Math.min(opt.bgm.duration, t - s);
      bgm.push({ audio: opt.bgm, start: s, duration: d, fadeIn: 0, fadeOut: 0 });
      s += d;
    } while (opt.bgmLoop && s < t);
    const fade = Math.max(0, opt.bgmFade);
    bgm[0].fadeIn = Math.min(fade, bgm[0].duration);
    const last = bgm[bgm.length - 1];
    last.fadeOut = Math.min(fade, last.duration);
  }
  return { visuals, cues: tidyCues(cues), bgm, duration: t };
}

/** 按每组 n 个切分 */
export function chunk<T>(arr: T[], n: number): T[][] {
  const k = Math.max(1, Math.floor(n));
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += k) out.push(arr.slice(i, i + k));
  return out;
}

/** 画布尺寸：auto 时跟随第一个素材 */
export function canvasSize(choice: string, first?: { width: number; height: number }): { width: number; height: number } {
  const m = /^(\d+)x(\d+)$/.exec(choice);
  if (m) return { width: +m[1], height: +m[2] };
  if (first && first.width > 0 && first.height > 0) return { width: first.width, height: first.height };
  return { width: 1920, height: 1080 };
}

// ---------------- 容器解析（网页引擎读不到时长时的后备） ----------------

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u64 = (b: Uint8Array, o: number) => u32(b, o) * 2 ** 32 + u32(b, o + 4);
const typ = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

/** 遍历 MP4 / MOV 盒子，返回 [类型, 内容开始, 内容结束] */
function* boxes(b: Uint8Array, start: number, end: number): Generator<[string, number, number]> {
  let o = start;
  while (o + 8 <= end) {
    let size = u32(b, o);
    const t = typ(b, o + 4);
    let head = 8;
    if (size === 1) { size = u64(b, o + 8); head = 16; } else if (size === 0) size = end - o;
    if (size < head || o + size > end) return;
    yield [t, o + head, o + size];
    o += size;
  }
}

/**
 * 从 MP4 / MOV 文件头读出时长（微秒）和画面宽高（取第一条有尺寸的轨道）。
 * 只读 moov/mvhd 与 trak/tkhd，不解码画面。读不到时返回 null。
 */
export function parseMp4(b: Uint8Array): { duration: number; width: number; height: number } | null {
  for (const [t, s, e] of boxes(b, 0, b.length)) {
    if (t !== 'moov') continue;
    let duration = 0, width = 0, height = 0;
    for (const [ct, cs, ce] of boxes(b, s, e)) {
      if (ct === 'mvhd') {
        const v1 = b[cs] === 1;
        const scale = u32(b, cs + (v1 ? 20 : 12));
        const dur = v1 ? u64(b, cs + 24) : u32(b, cs + 16);
        if (scale) duration = Math.round((dur / scale) * SEC);
      } else if (ct === 'trak' && !width) {
        for (const [tt, ts] of boxes(b, cs, ce)) {
          if (tt !== 'tkhd') continue;
          const v1 = b[ts] === 1;
          const wOff = ts + (v1 ? 88 : 76);
          const w = u32(b, wOff) / 65536, h = u32(b, wOff + 4) / 65536;
          if (w > 0 && h > 0) { width = Math.round(w); height = Math.round(h); }
        }
      }
    }
    return duration ? { duration, width, height } : null;
  }
  return null;
}

/** 从 WAV（PCM）文件头读出时长（微秒），读不到返回 null */
export function parseWav(b: Uint8Array): number | null {
  if (b.length < 12 || typ(b, 0) !== 'RIFF' || typ(b, 8) !== 'WAVE') return null;
  const le = (o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  let byteRate = 0;
  for (let o = 12; o + 8 <= b.length; ) {
    const id = typ(b, o), size = le(o + 4);
    if (id === 'fmt ') byteRate = le(o + 16);
    if (id === 'data' && byteRate) return Math.round((Math.min(size, b.length - o - 8) / byteRate) * SEC);
    o += 8 + size + (size & 1);
  }
  return null;
}
