"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const outputDirectory = path.resolve(__dirname, "..", "assets", "icons");
const sourcePath = path.join(outputDirectory, "arcade-favicon.png");
const sizes = [180, 192, 512];
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return output;
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  return leftDistance <= upDistance && leftDistance <= upLeftDistance ? left : (upDistance <= upLeftDistance ? up : upLeft);
}

function readPng(filePath) {
  const source = fs.readFileSync(filePath);
  assert.deepEqual(source.subarray(0, 8), pngSignature, "Le favicon source doit être un PNG");
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  const idat = [];

  while (offset < source.length) {
    const length = source.readUInt32BE(offset);
    const type = source.toString("ascii", offset + 4, offset + 8);
    const data = source.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      assert.equal(data[12], 0, "Le favicon source ne doit pas être entrelacé");
    }
    if (type === "IDAT") idat.push(data);
    offset += length + 12;
  }

  assert.equal(bitDepth, 8, "Le favicon source doit utiliser 8 bits par composante");
  assert.ok(colorType === 2 || colorType === 6, "Le favicon source doit être RGB ou RGBA");
  const sourceChannels = colorType === 6 ? 4 : 3;
  const bytesPerRow = width * sourceChannels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * 4);
  let rawOffset = 0;
  let previousRow = Buffer.alloc(bytesPerRow);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++];
    const row = Buffer.from(raw.subarray(rawOffset, rawOffset + bytesPerRow));
    rawOffset += bytesPerRow;
    for (let x = 0; x < bytesPerRow; x += 1) {
      const left = x >= sourceChannels ? row[x - sourceChannels] : 0;
      const up = previousRow[x];
      const upLeft = x >= sourceChannels ? previousRow[x - sourceChannels] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 0xff;
      else if (filter === 2) row[x] = (row[x] + up) & 0xff;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) row[x] = (row[x] + paeth(left, up, upLeft)) & 0xff;
      else assert.equal(filter, 0, "Filtre PNG non pris en charge");
    }
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = x * sourceChannels;
      const targetOffset = ((y * width) + x) * 4;
      pixels[targetOffset] = row[sourceOffset];
      pixels[targetOffset + 1] = row[sourceOffset + 1];
      pixels[targetOffset + 2] = row[sourceOffset + 2];
      pixels[targetOffset + 3] = sourceChannels === 4 ? row[sourceOffset + 3] : 255;
    }
    previousRow = row;
  }
  return { width, height, pixels };
}

function resize(source, targetSize) {
  const target = Buffer.alloc(targetSize * targetSize * 4);
  const scaleX = (source.width - 1) / Math.max(1, targetSize - 1);
  const scaleY = (source.height - 1) / Math.max(1, targetSize - 1);
  for (let y = 0; y < targetSize; y += 1) {
    const sourceY = y * scaleY;
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(source.height - 1, y0 + 1);
    const yMix = sourceY - y0;
    for (let x = 0; x < targetSize; x += 1) {
      const sourceX = x * scaleX;
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(source.width - 1, x0 + 1);
      const xMix = sourceX - x0;
      const targetOffset = ((y * targetSize) + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const topLeft = source.pixels[((y0 * source.width) + x0) * 4 + channel];
        const topRight = source.pixels[((y0 * source.width) + x1) * 4 + channel];
        const bottomLeft = source.pixels[((y1 * source.width) + x0) * 4 + channel];
        const bottomRight = source.pixels[((y1 * source.width) + x1) * 4 + channel];
        const top = topLeft + ((topRight - topLeft) * xMix);
        const bottom = bottomLeft + ((bottomRight - bottomLeft) * xMix);
        target[targetOffset + channel] = Math.round(top + ((bottom - top) * yMix));
      }
    }
  }
  return target;
}

function writePng(filePath, size, pixels) {
  const stride = (size * 4) + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  fs.writeFileSync(filePath, Buffer.concat([
    pngSignature,
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

const source = readPng(sourcePath);
for (const size of sizes) {
  writePng(path.join(outputDirectory, `arcade-icon-${size}.png`), size, resize(source, size));
}

console.log(`Icônes PWA générées depuis arcade-favicon.png : ${sizes.join(", ")} px`);
