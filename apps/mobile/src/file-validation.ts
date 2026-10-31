export function matchesSignature(bytes: Uint8Array, mime: string) {
  if (mime==='application/pdf') return [0x25,0x50,0x44,0x46,0x2d].every((n,i) => bytes[i]===n);
  if (mime==='image/jpeg') return bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff;
  if (mime==='image/png') return [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((n,i) => bytes[i]===n);
  return false;
}
