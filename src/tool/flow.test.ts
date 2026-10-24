// 流程测试：假的素材读取（不碰系统网页引擎）+ 内存文件系统，走完「逐个生成 / 拼接 / 分组」
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputItem, ItemResult, Params, RunContext } from '../kit/types';
import { SEC } from './core';

vi.mock('./media', () => ({
  probeVisual: async (_path: string, kind: string) => (kind === 'photo' ? { duration: 0, width: 800, height: 600 } : { duration: 4 * SEC, width: 1080, height: 1920 }),
  probeAudio: async () => 10 * SEC,
}));
import tool from './index';

const enc = (t: string) => new TextEncoder().encode(t);
let files: Map<string, Uint8Array>;

function ctx(over: Params = {}): RunContext {
  const params: Params = { ...Object.fromEntries(tool.params.map((f) => [f.key, f.default])), root: '/草稿', ...over };
  return {
    params, outputDir: '/out', signal: new AbortController().signal, progress: () => {},
    readFile: async (p) => { const f = files.get(p); if (!f) throw new Error('没有文件 ' + p); return f; },
    readText: async (p) => new TextDecoder().decode(files.get(p)!),
    writeFile: async (p, d) => void files.set(p, d),
    writeText: async (p, t) => void files.set(p, enc(t)),
    mkdir: async () => {}, join: async (...p) => p.join('/'), llm: async () => '', sidecar: async () => '', ffmpeg: async () => {}, duration: async () => 0,
  };
}
const item = (name: string): InputItem => ({ id: name, name, path: `/素材/${name}`, size: 1 });
const json = (p: string) => JSON.parse(new TextDecoder().decode(files.get(p)!));
const run = (c: RunContext, names: string[]) => Promise.all(names.map(async (n) => ({ item: item(n), result: await tool.run(item(n), c) as ItemResult })));
const after = (rs: Awaited<ReturnType<typeof run>>, c: RunContext) => tool.afterAll!(rs.map((r) => ({ item: r.item, result: r.result })) as never, c);

beforeEach(() => { files = new Map(); });

describe('每个素材一个草稿', () => {
  it('写出 draft_content.json 和 draft_meta_info.json，同名字幕带上', async () => {
    files.set('/素材/甲.srt', enc('1\n00:00:00,000 --> 00:00:01,500\n示例字幕\n'));
    const c = ctx();
    const rs = await run(c, ['甲.mp4', '乙.jpg']);
    expect(rs[0].result.outputPath).toBe('/草稿/甲');
    expect(rs[0].result.summary).toContain('字幕 1 条');
    expect(json('/草稿/甲/draft_content.json').tracks.map((t: { name: string }) => t.name)).toEqual(['主视频', '字幕']);
    expect(json('/草稿/乙/draft_content.json').duration).toBe(3 * SEC);
    expect(files.has('/草稿/甲/draft_meta_info.json')).toBe(true);
    expect(await after(rs, c)).toContain('草稿已生成');
  });
  it('草稿文件夹里已有同名草稿时加「(2)」，不覆盖', async () => {
    files.set('/草稿/甲/draft_content.json', enc('旧'));
    const r = await tool.run(item('甲.mp4'), ctx());
    expect(r.outputPath).toBe('/草稿/甲(2)');
    expect(new TextDecoder().decode(files.get('/草稿/甲/draft_content.json'))).toBe('旧');
  });
  it('没选草稿文件夹时给出明确提示', async () => {
    await expect(tool.run(item('甲.mp4'), ctx({ root: '' }))).rejects.toThrow('剪映草稿文件夹');
  });
  it('不支持的格式', async () => {
    await expect(tool.run(item('甲.avi'), ctx())).rejects.toThrow('只支持');
  });
});

describe('拼成一个 / 分组', () => {
  it('全部拼成一个：按自然顺序，加整段字幕和背景音乐', async () => {
    files.set('/m.mp3', enc('x'));
    files.set('/整段.srt', enc('1\n00:00:01,000 --> 00:00:02,000\n整体\n'));
    const c = ctx({ mode: 'all', bgm: '/m.mp3', srt: '/整段.srt', prefix: '合集' });
    const rs = await run(c, ['片10.mp4', '片2.mp4']);
    expect([...files.keys()].some((k) => k.includes('draft_content'))).toBe(false); // 拼接模式要等全部素材读完才写草稿
    const msg = await after(rs, c);
    expect(msg).toContain('已生成 1 个草稿');
    const d = json('/草稿/合集/draft_content.json');
    expect(d.tracks.map((t: { name: string }) => t.name)).toEqual(['背景音乐', '主视频', '整体字幕']);
    expect(d.materials.videos.map((m: { path: string }) => m.path)).toEqual(['/素材/片2.mp4', '/素材/片10.mp4']);
    expect(d.duration).toBe(8 * SEC);
  });
  it('每 2 个一组：5 个素材得到 3 个草稿，名字带序号', async () => {
    const c = ctx({ mode: 'group', groupSize: 2, prefix: '批' });
    const rs = await run(c, ['1.mp4', '2.mp4', '3.mp4', '4.mp4', '5.mp4']);
    await after(rs, c);
    expect([...files.keys()].filter((k) => k.endsWith('draft_content.json')).sort()).toEqual(['/草稿/批-01/draft_content.json', '/草稿/批-02/draft_content.json', '/草稿/批-03/draft_content.json']);
    expect(json('/草稿/批-03/draft_content.json').tracks[0].segments).toHaveLength(1);
  });
  it('整段字幕读不了时报错', async () => {
    const c = ctx({ mode: 'all', srt: '/没有.srt' });
    const rs = await run(c, ['1.mp4']);
    await expect(after(rs, c)).rejects.toThrow('整段字幕读不了');
  });
});
