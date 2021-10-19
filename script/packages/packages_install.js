import { exec } from "node:child_process"
import { resolveUrl, urlToFileSystemPath } from "@jsenv/filesystem"

const jsenvDirectoryUrl = resolveUrl("../../", import.meta.url)

const execCommand = (command, { cwd }) => {
  console.log(`> cd ${cwd}
> ${command}`)
  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        cwd,
      },
      (error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      },
    )
  })
}

const babelTransformDirectoryUrl = resolveUrl(
  "./script/performance/babel_transform/",
  jsenvDirectoryUrl,
)
await execCommand("npm install", {
  cwd: urlToFileSystemPath(babelTransformDirectoryUrl),
})
