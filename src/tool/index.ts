// 工具声明：剪映草稿批量生成器
import { Clapperboard as ClapperboardAsIcon } from 'lucide-react';
import type { BatchTool, InputItem, ItemResult, RunContext } from '../kit/types';
import {
  AUDIO_EXT, IMAGE_EXT, VIDEO_EXT, baseName, buildTimeline, canvasSize, chunk, decodeText, dirOf, fmtSec, kindOf, naturalCompare,
  parseSrt, safeName, sec, type AudioInfo, type Cue, type MediaInfo,
} from './core';
import { buildDraft } from './draft';
import { probeAudio, probeVisual } from './media';

const nameOf = (p: string) => p.replace(/^.*[\\/]/, '');

async function tryRead(ctx: RunContext, path: string): Promise<Uint8Array | null> {
  try {
    return await ctx.readFile(path);
  } catch {
    return null;
  }
}

function draftRoot(ctx: RunContext): string {
  const root = String(ctx.params.root ?? '').trim();
  if (!root) throw new Error('还没有选择「剪映草稿文件夹」：在剪映「全局设置 → 草稿位置」里能看到，选好后再开始');
  return root;
}

/** 读背景音乐信息（同一次处理里只读一次） */
const bgmCache = new Map<string, Promise<AudioInfo>>();
function loadBgm(ctx: RunContext): Promise<AudioInfo | null> {
  const p = String(ctx.params.bgm ?? '').trim();
  if (!p) return Promise.resolve(null);
  let hit = bgmCache.get(p);
  if (!hit) {
    hit = probeAudio(p, ctx.readFile).then((duration) => ({ path: p, name: nameOf(p), duration }));
    hit.catch(() => bgmCache.delete(p));
    bgmCache.set(p, hit);
  }
  return hit;
}

/** 草稿名：草稿文件夹里已有同名草稿或本次已用过时，加「(2)」「(3)」… */
async function pickName(ctx: RunContext, root: string, want: string, used: Set<string>) {
  const base = safeName(want);
  for (let i = 1; ; i++) {
    const name = i === 1 ? base : `${base}(${i})`;
    if (used.has(name)) continue;
    const dir = await ctx.join(root, name);
    const exists = (await tryRead(ctx, await ctx.join(dir, 'draft_content.json'))) || (await tryRead(ctx, await ctx.join(dir, 'draft_meta_info.json')));
    if (exists) continue;
    used.add(name);
    return { name, dir };
  }
}

async function writeDraft(ctx: RunContext, medias: MediaInfo[], want: string, used: Set<string>, extraCues: Cue[] = []) {
  const p = ctx.params;
  const root = draftRoot(ctx);
  const tl = buildTimeline(medias, {
    imageDuration: sec(Number(p.imageSeconds) || 3),
    bgm: await loadBgm(ctx),
    bgmLoop: Boolean(p.bgmLoop),
    bgmFade: sec(Math.max(0, Number(p.bgmFade) || 0)),
  });
  const size = canvasSize(String(p.canvas), medias[0]);
  const files = buildDraft(tl, extraCues, {
    ...size,
    fps: 30,
    videoVolume: p.keepSound ? 1 : 0,
    bgmVolume: Math.max(0, Math.min(100, Number(p.bgmVolume))) / 100,
    blurFill: p.fill === 'blur',
    subtitleSize: Number(p.subtitleSize) || 5,
  });
  const { name, dir } = await pickName(ctx, root, want, used);
  await ctx.writeText(await ctx.join(dir, 'draft_content.json'), files.content);
  await ctx.writeText(await ctx.join(dir, 'draft_meta_info.json'), files.meta);
  return { name, dir, duration: tl.duration, cues: tl.cues.length + extraCues.length };
}

/** 素材同一文件夹里有同名 .srt / .txt 时作为它的字幕 */
async function findSubs(ctx: RunContext, path: string): Promise<Pick<MediaInfo, 'subs' | 'subText'>> {
  if (!ctx.params.autoSubs) return {};
  const dir = dirOf(path);
  const base = baseName(path);
  const srt = await tryRead(ctx, await ctx.join(dir, `${base}.srt`));
  if (srt) {
    try {
      return { subs: parseSrt(decodeText(srt)) };
    } catch (e) {
      throw new Error(`同名字幕「${base}.srt」读不了：${e instanceof Error ? e.message : e}`);
    }
  }
  const txt = await tryRead(ctx, await ctx.join(dir, `${base}.txt`));
  return txt ? { subText: decodeText(txt) } : {};
}

const describe = (m: MediaInfo, shown: number) => {
  const n = m.subs?.length ?? (m.subText ? m.subText.split(/\r?\n/).filter((l) => l.trim()).length : 0);
  return `${m.kind === 'video' ? '视频' : '图片'} · ${fmtSec(shown)} · ${m.width}×${m.height}${n ? ` · 字幕 ${n} 条` : ''}`;
};

// 本次处理里已经用掉的草稿名（逐个生成时防止两个同名素材撞名）
let usedNames = new Set<string>();

const tool: BatchTool = {
  id: 'c04',
  name: '剪映草稿批量生成器',
  tagline: '把一批视频、图片按规则排进时间线，配上背景音乐和同名字幕，批量生成剪映草稿。打开剪映就能接着剪。全部在本机完成。',
  icon: ClapperboardAsIcon,
  category: '内容生产',
  type: 'media',
  mode: 'batch',
  resultView: 'list',
  concurrency: 1,
  accept: { label: '视频或图片', extensions: [...VIDEO_EXT, ...IMAGE_EXT] },
  params: [
    { key: 'mode', label: '怎么生成', type: 'segment', options: [['each', '每个素材一个草稿'], ['all', '全部拼成一个'], ['group', '每 N 个一个']], default: 'each' },
    { key: 'groupSize', label: '每个草稿放几个素材', type: 'number', default: 5, min: 1, max: 200, when: (p) => p.mode === 'group', help: '按文件名顺序分组，例如 5 个一组' },
    { key: 'canvas', label: '画布', type: 'select', options: [['1920x1080', '横屏 1920×1080'], ['1080x1920', '竖屏 1080×1920'], ['1080x1080', '方形 1080×1080'], ['auto', '跟随第一个素材']], default: '1080x1920' },
    { key: 'fill', label: '比例不同时的背景', type: 'segment', options: [['blur', '模糊背景'], ['none', '黑边']], default: 'blur' },
    { key: 'imageSeconds', label: '每张图片停留', type: 'number', default: 3, min: 0.5, max: 600, step: 0.5, unit: '秒' },
    { key: 'keepSound', label: '保留视频原声', type: 'toggle', default: true },
    { key: 'bgm', label: '背景音乐', type: 'file', extensions: AUDIO_EXT, fileLabel: '音频（mp3 / wav）', default: '', help: '不选就不加；每个草稿都会铺上这首' },
    { key: 'bgmVolume', label: '背景音乐音量', type: 'number', default: 60, min: 0, max: 100, unit: '%', when: (p) => Boolean(p.bgm) },
    { key: 'bgmFade', label: '淡入淡出', type: 'number', default: 1, min: 0, max: 10, step: 0.5, unit: '秒', when: (p) => Boolean(p.bgm) },
    { key: 'bgmLoop', label: '音乐不够长时循环', type: 'toggle', default: true, when: (p) => Boolean(p.bgm) },
    { key: 'autoSubs', label: '自动带上同名字幕', type: 'toggle', default: true, help: '素材旁边有同名的 .srt 或 .txt（每行一句）就加到字幕轨' },
    { key: 'srt', label: '整段字幕（SRT）', type: 'file', extensions: ['srt'], fileLabel: 'SRT 字幕', default: '', when: (p) => p.mode === 'all', help: '可选：按整个草稿的时间轴对齐，放在单独一条字幕轨' },
    { key: 'subtitleSize', label: '字幕字号', type: 'number', default: 5, min: 1, max: 30, when: (p) => Boolean(p.autoSubs) || Boolean(p.srt) },
    { key: 'prefix', label: '草稿名', type: 'text', default: '', placeholder: '留空用素材文件名', help: '逐个生成时作前缀；拼接时作草稿名，默认「批量草稿」' },
    { key: 'root', label: '剪映草稿文件夹', type: 'folder', default: '', help: '在剪映「全局设置 → 草稿位置」查看，一般以 JianyingPro Drafts 结尾' },
  ],

  async run(item: InputItem, ctx: RunContext): Promise<ItemResult> {
    draftRoot(ctx);
    const kind = kindOf(item.name);
    if (!kind) throw new Error('只支持 mp4、mov 视频和 jpg、png 图片');
    const info = await probeVisual(item.path!, kind, ctx.readFile);
    ctx.progress(0.4);
    const media: MediaInfo = { path: item.path!, name: item.name, kind, ...info, ...(await findSubs(ctx, item.path!)) };
    const shown = kind === 'photo' ? sec(Number(ctx.params.imageSeconds) || 3) : media.duration;
    if (ctx.params.mode !== 'each') return { summary: describe(media, shown), preview: kind === 'photo' ? item.path : undefined, data: media };
    const d = await writeDraft(ctx, [media], `${String(ctx.params.prefix ?? '').trim()}${baseName(item.name)}`, usedNames);
    return { summary: `草稿「${d.name}」 · ${describe(media, shown)}`, outputPath: d.dir, preview: kind === 'photo' ? item.path : undefined, data: media };
  },

  async afterAll(results, ctx) {
    const p = ctx.params;
    const root = draftRoot(ctx);
    usedNames = new Set();
    bgmCache.clear();
    if (p.mode === 'each') {
      return `草稿已生成到「${root}」，打开剪映即可看到；列表里没出现就重启一下剪映`;
    }
    const medias = results.map((r) => r.result.data as MediaInfo | undefined).filter((m): m is MediaInfo => !!m).sort((a, b) => naturalCompare(a.name, b.name));
    if (!medias.length) return;
    const title = String(p.prefix ?? '').trim() || '批量草稿';
    let extra: Cue[] = [];
    if (p.mode === 'all' && String(p.srt ?? '').trim()) {
      try {
        extra = parseSrt(decodeText(await ctx.readFile(String(p.srt))));
      } catch (e) {
        throw new Error(`整段字幕读不了：${e instanceof Error ? e.message : e}`);
      }
    }
    const groups = p.mode === 'all' ? [medias] : chunk(medias, Number(p.groupSize) || 5);
    const used = new Set<string>();
    const names: string[] = [];
    for (let i = 0; i < groups.length; i++) {
      const want = groups.length === 1 ? title : `${title}-${String(i + 1).padStart(2, '0')}`;
      const d = await writeDraft(ctx, groups[i], want, used, p.mode === 'all' ? extra : []);
      names.push(`${d.name}（${groups[i].length} 个素材，${fmtSec(d.duration)}）`);
      ctx.progress((i + 1) / groups.length);
    }
    return `已生成 ${names.length} 个草稿到「${root}」：${names.join('、')}。打开剪映即可看到，没出现就重启一下剪映`;
  },
};

export default tool;
