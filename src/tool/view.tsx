// 草稿卡片（结果）与空状态示意
import { Captions, Film, Image as ImageIcon, Music } from 'lucide-react';
import type { ItemResult } from '../kit/types';
import { SEC, fmtSec, type MediaInfo } from './core';
import './view.css';

const lastPart = (p: string) => p.replace(/[\\/]+$/, '').replace(/^.*[\\/]/, '');

/** 结果里的素材时长（秒）：图片取摘要里「N 秒」，读不到按 3 秒 */
function shownSeconds(m: MediaInfo, summary?: string) {
  if (m.kind === 'video') return m.duration / SEC;
  const hit = /(\d+(?:\.\d+)?) 秒/.exec(summary ?? '');
  return hit ? Number(hit[1]) : 3;
}

function ratioLabel(w: number, h: number) {
  if (!w || !h) return '';
  const r = w / h;
  return r < 0.9 ? '竖屏' : r > 1.1 ? '横屏' : '方形';
}

export function ResultBody({ result }: { item: unknown; result: ItemResult }) {
  const m = result.data as MediaInfo | undefined;
  if (!m) return <span className="jd-plain">{result.summary}</span>;
  const secs = shownSeconds(m, result.summary);
  const total = secs * SEC;
  const draft = result.outputPath ? lastPart(result.outputPath) : '';
  const cues = m.subs?.length ? m.subs.map((c) => ({ at: Math.min(0.96, c.start / total), w: Math.max(0.03, c.duration / total) }))
    : m.subText ? m.subText.split(/\r?\n/).filter((l) => l.trim()).map((_, i, a) => ({ at: i / a.length, w: 0.9 / a.length })) : [];
  const ratio = m.width && m.height ? Math.max(0.5, Math.min(1.8, m.width / m.height)) : 1;
  return (
    <div className="jd-card">
      <div className="jd-head">
        <span className="jd-frame" style={{ aspectRatio: String(ratio) }}>
          {result.preview ? <img src={result.preview} alt="" /> : m.kind === 'video' ? <Film size={14} /> : <ImageIcon size={14} />}
        </span>
        <span className="jd-time"><b className="k-num">{secs % 1 === 0 ? secs : secs.toFixed(1)}</b><small>秒</small></span>
      </div>
      <div className="jd-meta">
        <span className="jd-badge">{m.kind === 'video' ? '视频' : '图片'}</span>
        <span className="k-num">{m.width}×{m.height}</span>
        {ratioLabel(m.width, m.height) && <span>{ratioLabel(m.width, m.height)}</span>}
      </div>
      <div className="jd-tracks" aria-label={`时间线，共 ${fmtSec(total)}`}>
        <div className="jd-track"><Film size={12} /><span className="jd-lane"><i className="jd-clip" style={{ left: 0, width: '100%' }} /></span></div>
        <div className="jd-track"><Captions size={12} /><span className="jd-lane">{cues.map((c, i) => <i key={i} className="jd-cue" style={{ left: `${c.at * 100}%`, width: `${c.w * 100}%` }} />)}</span></div>
      </div>
      <div className="jd-foot">{draft ? <><b>草稿</b><span className="k-ellipsis" title={draft}>{draft}</span></> : <span>待拼入草稿</span>}{cues.length > 0 && <span className="jd-n k-num">字幕 {m.subs?.length ?? cues.length} 条</span>}</div>
    </div>
  );
}

export function Empty({ hover }: { hover: boolean }) {
  return (
    <div className={`jd-empty${hover ? ' hover' : ''}`}>
      <svg className="jd-art" viewBox="0 0 520 190" role="img" aria-label="几个视频和图片排进剪映草稿的时间线">
        <g>
          <rect x="14" y="22" width="84" height="52" rx="8" className="s-a" />
          <rect x="26" y="62" width="60" height="5" rx="2.5" className="s-a2" />
          <rect x="14" y="68" width="84" height="52" rx="8" className="s-b" transform="translate(0 6)" />
          <rect x="14" y="132" width="84" height="40" rx="8" className="s-c" />
          <text x="56" y="14" textAnchor="middle" className="t-s">一批素材</text>
        </g>
        <g className="s-arrow"><path d="M122 98h60" /><path d="M172 88l12 10-12 10" /></g>
        <g>
          <rect x="204" y="22" width="302" height="150" rx="12" className="s-board" />
          <text x="218" y="42" className="t-s">剪映草稿</text>
          <rect x="218" y="56" width="62" height="22" rx="5" className="s-a" />
          <rect x="284" y="56" width="90" height="22" rx="5" className="s-b" />
          <rect x="378" y="56" width="114" height="22" rx="5" className="s-c" />
          <rect x="234" y="88" width="34" height="9" rx="4.5" className="s-cue" />
          <rect x="300" y="88" width="48" height="9" rx="4.5" className="s-cue" />
          <rect x="396" y="88" width="60" height="9" rx="4.5" className="s-cue" />
          <rect x="218" y="112" width="274" height="14" rx="7" className="s-bgm" />
          <text x="218" y="150" className="t-s">视频轨 · 字幕轨 · 背景音乐轨</text>
        </g>
      </svg>
      <h2>一批素材，一次排成剪映草稿</h2>
      <p>把视频或图片拖进窗口，也可以点上方的「添加」。按文件名顺序排进时间线，素材旁同名的字幕、你选的背景音乐会一并加上。</p>
      <ul className="jd-points">
        <li><Film size={14} />每个素材一个草稿，或拼成一个</li>
        <li><Captions size={14} />同名 SRT、TXT 自动成字幕</li>
        <li><Music size={14} />背景音乐淡入淡出、循环</li>
      </ul>
    </div>
  );
}
