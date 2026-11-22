import { describe, expect, it } from 'vitest';
import { detectMediaType } from './media';

const isoBrand = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}`, 'latin1')]);

describe('detectMediaType', () => {
  it('JPEG по FF D8 FF', () => {
    expect(detectMediaType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image');
  });

  it('PNG по 89 PNG', () => {
    expect(detectMediaType(Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG\r\n\x1a\n')]))).toBe('image');
  });

  it('GIF по GIF8 — видео', () => {
    expect(detectMediaType(Buffer.from('GIF89a'))).toBe('video');
  });

  it('WebP по RIFF....WEBP', () => {
    expect(detectMediaType(Buffer.from('RIFF0000WEBP'))).toBe('image');
  });

  it('MP4 по ftyp isom', () => {
    expect(detectMediaType(isoBrand('isom'))).toBe('video');
  });

  it('MOV по ftyp qt (с двумя пробелами)', () => {
    expect(detectMediaType(isoBrand('qt  '))).toBe('video');
  });

  it('WebM по 1A 45 DF A3', () => {
    expect(detectMediaType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]))).toBe('video');
  });

  it('HEIC (ftyp heic) не поддерживается', () => {
    expect(detectMediaType(isoBrand('heic'))).toBeNull();
  });

  it('AVIF (ftyp avif) не поддерживается', () => {
    expect(detectMediaType(isoBrand('avif'))).toBeNull();
  });

  it('PDF не поддерживается', () => {
    expect(detectMediaType(Buffer.from('%PDF-1.7'))).toBeNull();
  });

  it('слишком короткий буфер не поддерживается', () => {
    expect(detectMediaType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectMediaType(Buffer.alloc(0))).toBeNull();
  });
});
