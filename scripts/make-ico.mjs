import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Wraps the 16/32/48 PNGs in an ICO container. ICO has allowed embedded PNG
// data since Vista, which every browser in use understands, so there is no
// need for a BMP encoder here.
const dir = process.argv[2];
const out = process.argv[3];
const sizes = [16, 32, 48];

const images = sizes.map((size) => ({ size, data: readFileSync(join(dir, `ico-${size}.png`)) }));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(images.length, 4);

let offset = 6 + images.length * 16;
const entries = images.map(({ size, data }) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette colours
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(data.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += data.length;
  return entry;
});

writeFileSync(out, Buffer.concat([header, ...entries, ...images.map((image) => image.data)]));
console.log(`wrote ${out} (${sizes.join(", ")} px)`);
