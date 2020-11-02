import { MimeType } from './mime'

declare const assets: {
  [path: string]: InlineAsset | undefined
}

export default assets

export type InlineAsset = [
  etag: string,
  mime: MimeType,
  numBytes: number,
  getText: () => string
]
