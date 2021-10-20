// https://developers.google.com/web/updates/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
export const stringFromArrayBuffer = (arrayBuffer) => {
  return String.fromCharCode.apply(null, new Uint16Array(arrayBuffer))
}

export const arrayBufferFromString = (string) => {
  var buf = new ArrayBuffer(string.length * 2) // 2 bytes for each char
  var bufView = new Uint16Array(buf)
  for (var i = 0, strLen = string.length; i < strLen; i++) {
    bufView[i] = string.charCodeAt(i)
  }
  return buf
}

// https://stackoverflow.com/a/12101012
export const bufferFromArrayBuffer = (arrayBuffer) => {
  const buffer = Buffer.alloc(arrayBuffer.byteLength)
  const view = new Uint8Array(arrayBuffer)
  for (let i = 0; i < buffer.length; ++i) {
    buffer[i] = view[i]
  }
  return buffer
}

export const arrayBufferFromBuffer = (buffer) => {
  const arrayBuffer = new ArrayBuffer(buffer.length)
  const view = new Uint8Array(arrayBuffer)
  for (let i = 0; i < buffer.length; ++i) {
    view[i] = buffer[i]
  }
  return arrayBuffer
}
