import { describe, expect, it } from 'vitest'
import { decodeSide, sideOf } from './side'

describe('decodeSide', () => {
  it('decodes UTF-8, strips a UTF-8 BOM and keeps CRLF', () => {
    expect(decodeSide(Buffer.from('a\r\nb'))).toEqual({ status: 'text', text: 'a\r\nb' })
    expect(decodeSide(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('x')]))).toEqual({ status: 'text', text: 'x' })
    expect(decodeSide(Buffer.alloc(0))).toEqual({ status: 'text', text: '' })
  })
  it('decodes UTF-16 LE and BE only with a BOM, even though they contain NUL bytes', () => {
    expect(decodeSide(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hé\n', 'utf16le')]))).toEqual({ status: 'text', text: 'hé\n' })
    const be = Buffer.from('hé\n', 'utf16le').swap16()
    expect(decodeSide(Buffer.concat([Buffer.from([0xfe, 0xff]), be]))).toEqual({ status: 'text', text: 'hé\n' })
    expect(decodeSide(Buffer.from('hé\n', 'utf16le'))).toEqual({ status: 'omitted', reason: 'binary' })
    expect(decodeSide(Buffer.from([0xfe, 0xff, 0x00]))).toEqual({ status: 'omitted', reason: 'unsupported_encoding' })
  })
  it('calls NUL bytes in the first 8000 bytes binary, but not later ones (Git\'s window)', () => {
    expect(decodeSide(Buffer.from([0x61, 0, 0x62]))).toEqual({ status: 'omitted', reason: 'binary' })
    const late = Buffer.concat([Buffer.alloc(8000, 0x61), Buffer.from([0])])
    expect(decodeSide(late).status).toBe('text')
  })
  it('does not guess other encodings', () => {
    expect(decodeSide(Buffer.from([0x63, 0xe9]))).toEqual({ status: 'omitted', reason: 'unsupported_encoding' })
    expect(sideOf(Buffer.from([0x63, 0xe9]), 2)).toEqual({ status: 'omitted', reason: 'unsupported_encoding', size: 2 })
    expect(sideOf(Buffer.from('ok'), 2)).toEqual({ status: 'text', text: 'ok', size: 2 })
  })
})
