// 截图与预览用的示例数据（不会进入正式运行）
import type { Row } from '../kit/runner';

function thumb(hue: number) {
  const c = document.createElement('canvas');
  c.width = 90; c.height = 160;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 90, 160);
  grd.addColorStop(0, `hsl(${hue} 35% 62%)`); grd.addColorStop(1, `hsl(${(hue + 40) % 360} 30% 38%)`);
  g.fillStyle = grd; g.fillRect(0, 0, 90, 160);
  g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(14, 120, 62, 6); g.fillRect(24, 132, 42, 6);
  return c.toDataURL('image/png');
}

const list: [string, number, Row['status'], string?, string?][] = [
  ['示例片段-01.mp4', 20_480_000, 'ok', '草稿「示例片段-01」 · 视频 · 12.4 秒 · 1080×1920 · 字幕 3 条'],
  ['示例片段-02.mp4', 18_120_000, 'ok', '草稿「示例片段-02」 · 视频 · 9.8 秒 · 1080×1920'],
  ['示例图片-03.jpg', 940_000, 'ok', '草稿「示例图片-03」 · 图片 · 3 秒 · 1080×1920'],
  ['示例片段-04.mov', 31_000_000, 'run'],
  ['示例片段-05.mp4', 12_900_000, 'wait'],
  ['示例照片-06.heic', 8_000_000, 'err', undefined, '只支持 mp4、mov 视频和 jpg、png 图片'],
];

const US = 1_000_000;
const demo = (name: string, i: number) => {
  const dur = [12.4, 9.8, 0, 15.2, 8, 0][i] ?? 8;
  const subs = i === 0 ? [[0.5, 3], [4, 3.5], [8.2, 3.6]].map(([a, d]) => ({ start: a * US, duration: d * US, text: '示例字幕' })) : i === 3 ? [[1, 4], [6, 4], [11, 3.5]].map(([a, d]) => ({ start: a * US, duration: d * US, text: '示例字幕' })) : undefined;
  return { path: `/示例/${name}`, name, kind: /图片/.test(name) ? 'photo' : 'video', duration: dur * US, width: 1080, height: i === 1 ? 1080 : 1920, subs };
};

export const rows = (state: string): Row[] =>
  state === 'empty' ? [] : list.map(([name, size, status, summary, error], i) => {
    const st = state === 'done' && status !== 'err' ? 'ok' : status;
    return {
      item: { id: `j${i}`, name, path: thumb(20 + i * 50), size },
      status: st,
      progress: st === 'run' ? 0.5 : st === 'ok' ? 1 : 0,
      error: st === 'err' ? error : undefined,
      result: st === 'ok' ? { summary: summary ?? '草稿「示例」 · 视频 · 8 秒 · 1080×1920', outputPath: `/示例/剪映草稿/${name.replace(/\.[^.]+$/, '')}`, preview: thumb(20 + i * 50), data: demo(name, i) } : undefined,
    };
  });

export const params = { mode: 'each', canvas: '1080x1920', root: '/示例/剪映草稿' };

export const notice = { kind: 'ok' as const, text: '已生成 5 个草稿到「/示例/剪映草稿」，打开剪映即可看到；列表里没出现就重启一下剪映' };
