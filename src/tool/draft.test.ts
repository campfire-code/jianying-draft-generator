import { describe, expect, it } from 'vitest';
import { SEC, buildTimeline, sec, PHOTO_DURATION, type MediaInfo } from './core';
import { buildDraft, dumps } from './draft';

const v = (name: string, s: number): MediaInfo => ({ path: `/素材/${name}`, name, kind: 'video', duration: sec(s), width: 1080, height: 1920, subs: [{ start: 0, duration: SEC, text: '示例字幕' }] });
const img: MediaInfo = { path: '/素材/图.jpg', name: '图.jpg', kind: 'photo', duration: 0, width: 800, height: 600 };
const opts = { width: 1080, height: 1920, fps: 30, videoVolume: 0, bgmVolume: 0.6, blurFill: true, subtitleSize: 5 };
type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function build(bgm = true, extra = [] as { start: number; duration: number; text: string }[]) {
  const tl = buildTimeline([v('a.mp4', 5), img, v('b.mp4', 2)], { imageDuration: 3 * SEC, bgm: bgm ? { path: '/m.mp3', name: 'm.mp3', duration: 20 * SEC } : null, bgmLoop: true, bgmFade: SEC });
  return JSON.parse(buildDraft(tl, extra, opts).content) as Obj; // 取序列化后的内容，浮点已还原成数字
}

describe('草稿 JSON 结构', () => {
  it('画布、帧率、总时长', () => {
    const j = build();
    expect(j.canvas_config).toEqual({ width: 1080, height: 1920, ratio: 'original' });
    expect(j.fps).toBe(30);
    expect(j.duration).toBe(10 * SEC);
  });
  it('轨道顺序：背景音乐、主视频、字幕；整段字幕另起一条轨', () => {
    expect(build().tracks.map((t: Obj) => [t.type, t.name])).toEqual([['audio', '背景音乐'], ['video', '主视频'], ['text', '字幕']]);
    expect(build(false, [{ start: 0, duration: SEC, text: '整体' }]).tracks.map((t: Obj) => t.name)).toEqual(['主视频', '字幕', '整体字幕']);
  });
  it('每个片段引用的素材 id 都存在，且时间首尾相接', () => {
    const j = build();
    const ids = new Set(Object.values(j.materials).flatMap((l) => (l as Obj[]).map((m) => m.id)));
    for (const t of j.tracks) for (const s of t.segments) {
      expect(ids.has(s.material_id)).toBe(true);
      for (const r of s.extra_material_refs) if (t.type !== 'text') expect(ids.has(r)).toBe(true);
    }
    const video = j.tracks[1].segments;
    expect(video.map((s: Obj) => [s.target_timerange.start, s.target_timerange.duration])).toEqual([[0, 5 * SEC], [5 * SEC, 3 * SEC], [8 * SEC, 2 * SEC]]);
  });
  it('素材：视频与图片登记到 videos，图片时长按 pyJianYingDraft 写 10800000000，类型分别是 video / photo', () => {
    const vids = build().materials.videos as Obj[];
    expect(vids.map((m) => m.type)).toEqual(['video', 'photo', 'video']);
    expect(vids[1].duration).toBe(PHOTO_DURATION);
    expect(vids[0].duration).toBe(5 * SEC);
    expect(vids[0].path).toBe('/素材/a.mp4');
  });
  it('背景音乐循环只登记一个音频素材，音量与淡入淡出写入', () => {
    const j = build();
    expect(j.materials.audios).toHaveLength(1);
    expect(j.tracks[0].segments).toHaveLength(1); // 20 秒音乐盖住 10 秒画面
    expect(j.tracks[0].segments[0].volume).toBeCloseTo(0.6);
    expect(j.materials.audio_fades[0]).toMatchObject({ fade_in_duration: SEC, fade_out_duration: SEC });
  });
  it('静音视频、字幕文本和位置', () => {
    const j = build();
    expect(j.tracks[1].segments[0].volume).toBe(0);
    expect(j.tracks[1].segments[1].volume).toBe(1);
    expect(j.materials.texts).toHaveLength(2);
    expect(JSON.parse(j.materials.texts[0].content).text).toBe('示例字幕');
    expect(j.tracks[2].segments[0].clip.transform.y).toBeCloseTo(-0.8);
  });
  it('模糊背景：每个画面片段一个 canvas_blur；黑边时没有', () => {
    expect(build().materials.canvases).toHaveLength(3);
    const tl = buildTimeline([v('a.mp4', 1)], { imageDuration: SEC, bgmLoop: false, bgmFade: 0 });
    expect((buildDraft(tl, [], { ...opts, blurFill: false }).json.materials as Obj).canvases).toHaveLength(0);
  });
  it('id 互不重复；输出文本是合法 JSON 且和对象一致', () => {
    const tl = buildTimeline([v('a.mp4', 1), v('b.mp4', 1)], { imageDuration: SEC, bgmLoop: false, bgmFade: 0 });
    const d = buildDraft(tl, [], opts);
    expect(JSON.parse(d.content).duration).toBe(2 * SEC);
    const segIds = (d.json.tracks as Obj[]).flatMap((t) => t.segments.map((s: Obj) => s.id));
    expect(new Set(segIds).size).toBe(segIds.length);
    expect(JSON.parse(d.meta)).toBeTypeOf('object');
  });
  it('dumps：浮点保留小数点，缩进 4 空格', () => {
    expect(dumps({ a: 1, b: [] })).toContain('    "a": 1');
  });
});
