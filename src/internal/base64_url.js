export const stringifyDataUrl = ({ mediaType, base64Flag = true, data }) => {
  if (!mediaType || mediaType === "text/plain;charset=US-ASCII") {
    // can be a buffer or a string, hence check on data.length instead of !data or data === ''
    if (data.length === 0) {
      return `data:,`
    }
    if (base64Flag) {
      return `data:,${data}`
    }
    return `data:,${asBase64(data)}`
  }
  if (base64Flag) {
    return `data:${mediaType};base64,${asBase64(data)}`
  }
  return `data:${mediaType},${data}`
}

export const asBase64 = (data) => Buffer.from(data).toString("base64")
