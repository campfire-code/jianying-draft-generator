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
  ['示例片段-06.avi', 8_000_000, 'err', undefined, '只支持 mp4、mov 视频和 jpg、png 图片'],
];

export const rows = (state: string): Row[] =>
  state === 'empty' ? [] : list.map(([name, size, status, summary, error], i) => {
    const st = state === 'done' && status !== 'err' ? 'ok' : status;
    return {
      item: { id: `j${i}`, name, path: thumb(20 + i * 50), size },
      status: st,
      progress: st === 'run' ? 0.5 : st === 'ok' ? 1 : 0,
      error: st === 'err' ? error : undefined,
      result: st === 'ok' ? { summary: summary ?? '草稿「示例」 · 视频 · 8 秒 · 1080×1920', outputPath: '/示例/JianyingPro Drafts', preview: thumb(20 + i * 50) } : undefined,
    };
  });

export const params = { mode: 'each', canvas: '1080x1920', root: '/示例/JianyingPro Drafts' };
