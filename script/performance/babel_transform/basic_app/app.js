/**
 * The actual app UI, very simplified of course
 */

import { greet } from "./greet.js"

export const render = () => {
  const logoUrl = new URL("../logo.png", import.meta.url)

  console.log(logoUrl, greet)
}
