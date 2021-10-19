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
