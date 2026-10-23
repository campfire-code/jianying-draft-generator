import { describe, expect, it } from 'vitest';
import {
  SEC, buildTimeline, canvasSize, chunk, decodeText, fmtSec, kindOf, naturalCompare, parseMp4, parseSrt, parseWav, safeName, sec, spreadLines, srtStamp, tidyCues,
  type MediaInfo,
} from './core';

const v = (name: string, s: number, over: Partial<MediaInfo> = {}): MediaInfo => ({ path: `/素材/${name}`, name, kind: 'video', duration: sec(s), width: 1080, height: 1920, ...over });
const photo = (name: string): MediaInfo => ({ path: `/素材/${name}`, name, kind: 'photo', duration: 0, width: 800, height: 600 });

describe('基础换算', () => {
  it('秒与微秒', () => {
    expect(sec(1.5)).toBe(1_500_000);
    expect(fmtSec(3 * SEC)).toBe('3 秒');
    expect(fmtSec(12_300_000)).toBe('12.3 秒');
  });
  it('素材类型与文件名', () => {
    expect(kindOf('a.MP4')).toBe('video');
    expect(kindOf('a.jpeg')).toBe('photo');
    expect(kindOf('a.gif')).toBeNull();
    expect(safeName('a/b:c*')).toBe('a b c');
    expect(safeName('  ')).toBe('未命名草稿');
    expect(['片段10', '片段2', '片段1'].sort(naturalCompare)).toEqual(['片段1', '片段2', '片段10']);
  });
  it('分组与画布', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2], 0)).toEqual([[1], [2]]);
    expect(canvasSize('1080x1920')).toEqual({ width: 1080, height: 1920 });
    expect(canvasSize('auto', { width: 640, height: 360 })).toEqual({ width: 640, height: 360 });
    expect(canvasSize('auto')).toEqual({ width: 1920, height: 1080 });
  });
});

describe('字幕', () => {
  it('SRT 时间戳转微秒，容忍小数点', () => {
    expect(srtStamp('00:01:02,345')).toBe(62_345_000);
    expect(srtStamp('00:00:01.5')).toBe(1_500_000);
    expect(() => srtStamp('abc')).toThrow('字幕时间格式不对');
  });
  it('解析 SRT：BOM、CRLF、多行内容、没有序号行', () => {
    const cues = parseSrt('﻿1\r\n00:00:00,000 --> 00:00:02,000\r\n第一句\r\n第二行\r\n\r\n00:00:02,500 --> 00:00:04,000\r\n没有序号（示例）\r\n');
    expect(cues).toEqual([
      { start: 0, duration: 2_000_000, text: '第一句\n第二行' },
      { start: 2_500_000, duration: 1_500_000, text: '没有序号（示例）' },
    ]);
  });
  it('SRT 缺时间行时报错', () => {
    expect(() => parseSrt('1\n只有文字')).toThrow('找不到时间行');
  });
  it('文本按行平均分配，相邻无缝', () => {
    const c = spreadLines('甲\n\n乙\n丙', 1_000_000, 3 * SEC);
    expect(c.map((x) => x.text)).toEqual(['甲', '乙', '丙']);
    expect(c[0].start).toBe(1_000_000);
    c.slice(1).forEach((x, i) => expect(x.start).toBe(c[i].start + c[i].duration));
    expect(c[2].start + c[2].duration).toBe(4_000_000);
    expect(spreadLines('', 0, SEC)).toEqual([]);
  });
  it('整理字幕：重叠时前一条截断，同起点的前一条被丢弃', () => {
    const t = tidyCues([{ start: 0, duration: 3 * SEC, text: 'a' }, { start: 2 * SEC, duration: SEC, text: 'b' }, { start: 2 * SEC, duration: SEC, text: 'c' }]);
    expect(t.map((x) => [x.text, x.start, x.duration])).toEqual([['a', 0, 2 * SEC], ['c', 2 * SEC, SEC]]);
  });
  it('GBK 字幕自动识别', () => {
    expect(decodeText(new TextEncoder().encode('你好'))).toBe('你好');
    expect(decodeText(new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]))).toBe('你好');
  });
});

describe('时间线', () => {
  it('素材首尾相接，图片按设定时长，字幕跟着素材平移并截断', () => {
    const a = v('a.mp4', 4, { subs: [{ start: 0, duration: SEC, text: '开头' }, { start: 3 * SEC, duration: 5 * SEC, text: '超长' }, { start: 9 * SEC, duration: SEC, text: '丢弃' }] });
    const tl = buildTimeline([a, photo('b.jpg'), v('c.mp4', 2, { subText: '一\n二' })], { imageDuration: 3 * SEC, bgmLoop: false, bgmFade: 0 });
    expect(tl.visuals.map((p) => [p.start, p.duration])).toEqual([[0, 4 * SEC], [4 * SEC, 3 * SEC], [7 * SEC, 2 * SEC]]);
    expect(tl.duration).toBe(9 * SEC);
    expect(tl.cues.map((c) => [c.text, c.start, c.duration])).toEqual([
      ['开头', 0, SEC], ['超长', 3 * SEC, SEC], ['一', 7 * SEC, SEC], ['二', 8 * SEC, SEC],
    ]);
  });
  it('背景音乐：不循环时只铺一遍并按画面截断，淡入淡出不超过片段', () => {
    const tl = buildTimeline([v('a.mp4', 10)], { imageDuration: 0, bgm: { path: '/m.mp3', name: 'm.mp3', duration: 4 * SEC }, bgmLoop: false, bgmFade: 6 * SEC });
    expect(tl.bgm).toHaveLength(1);
    expect(tl.bgm[0]).toMatchObject({ start: 0, duration: 4 * SEC, fadeIn: 4 * SEC, fadeOut: 4 * SEC });
  });
  it('背景音乐：循环铺满，最后一段截到画面结束，只有首尾淡入淡出', () => {
    const tl = buildTimeline([v('a.mp4', 10)], { imageDuration: 0, bgm: { path: '/m.mp3', name: 'm.mp3', duration: 4 * SEC }, bgmLoop: true, bgmFade: SEC });
    expect(tl.bgm.map((b) => [b.start, b.duration])).toEqual([[0, 4 * SEC], [4 * SEC, 4 * SEC], [8 * SEC, 2 * SEC]]);
    expect(tl.bgm.map((b) => [b.fadeIn, b.fadeOut])).toEqual([[SEC, 0], [0, 0], [0, SEC]]);
  });
  it('读不到时长的素材报错', () => {
    expect(() => buildTimeline([v('x.mp4', 0)], { imageDuration: SEC, bgmLoop: false, bgmFade: 0 })).toThrow('读不到时长');
  });
});

// 按 ISO 14496-12 的盒子结构手工拼一个最小 MP4 头：moov/mvhd + trak/tkhd
function box(type: string, ...parts: Uint8Array[]) {
  const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { body.set(p, o); o += p.length; }
  const out = new Uint8Array(8 + body.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(body, 8);
  return out;
}
function mvhd(scale: number, dur: number) {
  const b = new Uint8Array(100);
  const d = new DataView(b.buffer);
  d.setUint32(12, scale);
  d.setUint32(16, dur);
  return box('mvhd', b);
}
function tkhd(w: number, h: number) {
  const b = new Uint8Array(84);
  const d = new DataView(b.buffer);
  d.setUint32(76, w * 65536);
  d.setUint32(80, h * 65536);
  return box('tkhd', b);
}
describe('容器解析', () => {
  it('MP4：读时长与宽高，跳过没有尺寸的音频轨', () => {
    const mp4 = box('moov', mvhd(1000, 12_500), box('trak', tkhd(0, 0)), box('trak', tkhd(1920, 1080)));
    expect(parseMp4(new Uint8Array([...box('ftyp', new TextEncoder().encode('isom')), ...mp4]))).toEqual({ duration: 12_500_000, width: 1920, height: 1080 });
  });
  it('MP4：没有 moov 返回 null', () => {
    expect(parseMp4(box('ftyp', new TextEncoder().encode('isom')))).toBeNull();
  });
  it('WAV：按字节率算时长', () => {
    const b = new Uint8Array(12 + 24 + 8 + 88200);
    const d = new DataView(b.buffer);
    b.set(new TextEncoder().encode('RIFF'), 0);
    b.set(new TextEncoder().encode('WAVE'), 8);
    b.set(new TextEncoder().encode('fmt '), 12);
    d.setUint32(16, 16, true);
    d.setUint32(28, 44100 * 2, true); // 字节率
    b.set(new TextEncoder().encode('data'), 36);
    d.setUint32(40, 88200, true);
    expect(parseWav(b)).toBe(SEC);
    expect(parseWav(new Uint8Array(20))).toBeNull();
  });
});
