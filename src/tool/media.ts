// 读取素材的时长和宽高：先用系统网页引擎读元数据（不读整个文件），读不到再读文件头自己解析。
import { fileSrc } from '../kit/platform';
import { extOf, parseMp4, parseWav, sec } from './core';

const TIMEOUT = 15000;

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error(`${what}超时`)), TIMEOUT))]);
}

async function imageSize(path: string) {
  const img = new Image();
  img.src = fileSrc(path);
  try {
    await withTimeout(img.decode(), '读取图片');
  } catch {
    throw new Error('无法识别这张图片，可能已损坏或格式不受支持');
  }
  return { width: img.naturalWidth, height: img.naturalHeight };
}

function elementMeta(tag: 'video' | 'audio', path: string) {
  const el = document.createElement(tag);
  el.preload = 'metadata';
  el.muted = true;
  const done = new Promise<{ duration: number; width: number; height: number }>((ok, no) => {
    el.onloadedmetadata = () => {
      const d = el.duration;
      const v = el as HTMLVideoElement;
      if (!Number.isFinite(d) || d <= 0) return no(new Error('读不到时长'));
      // 向下取整到毫秒，避免比素材实际长度多出零点几毫秒
      ok({ duration: Math.floor(d * 1000) * 1000, width: tag === 'video' ? v.videoWidth : 0, height: tag === 'video' ? v.videoHeight : 0 });
    };
    el.onerror = () => no(new Error('格式不受支持'));
  });
  el.src = fileSrc(path);
  return withTimeout(done, '读取素材信息').finally(() => { el.removeAttribute('src'); el.load(); });
}

export async function probeVisual(path: string, kind: 'video' | 'photo', readFile: (p: string) => Promise<Uint8Array>) {
  if (kind === 'photo') return { duration: 0, ...(await imageSize(path)) };
  try {
    const m = await elementMeta('video', path);
    if (m.width && m.height) return m;
  } catch { /* 走后备解析 */ }
  const info = parseMp4(await readFile(path));
  if (!info || !info.width) throw new Error('读不到视频的时长或尺寸，文件可能已损坏');
  return { duration: Math.floor(info.duration / 1000) * 1000, width: info.width, height: info.height };
}

export async function probeAudio(path: string, readFile: (p: string) => Promise<Uint8Array>) {
  try {
    return (await elementMeta('audio', path)).duration;
  } catch { /* 走后备解析 */ }
  const d = extOf(path) === 'wav' ? parseWav(await readFile(path)) : null;
  if (!d) throw new Error('读不到背景音乐的时长，文件可能已损坏或格式不受支持');
  return Math.floor(d / 1000) * 1000 || sec(0.001);
}
