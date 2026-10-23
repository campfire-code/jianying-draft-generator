// 生成 samples/ 里的示例素材（只在设置了 MAKE_SAMPLES=1 时运行）。全部是程序画的纯色图和静音 WAV，内容均为虚构。
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type: string, data: Buffer) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, tail]);
}
function png(w: number, h: number, rgb: [number, number, number]) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}
function wav(seconds: number) {
  const rate = 8000, n = rate * seconds;
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  b.fill(128, 44);
  return b;
}

it.runIf(process.env.MAKE_SAMPLES === '1')('生成示例文件', () => {
  mkdirSync('samples', { recursive: true });
  const colors: [number, number, number][] = [[214, 120, 80], [70, 140, 160], [120, 160, 90]];
  ['图1', '图2', '图3'].forEach((n, i) => writeFileSync(`samples/${n}（示例）.png`, png(320, 180, colors[i])));
  writeFileSync('samples/图1（示例）.srt', '1\n00:00:00,500 --> 00:00:02,000\n这是示例字幕\n\n2\n00:00:02,000 --> 00:00:02,900\n第二句示例字幕\n');
  writeFileSync('samples/图2（示例）.txt', '第一行示例文字\n第二行示例文字\n');
  writeFileSync('samples/背景音乐（示例）.wav', wav(5));
});
