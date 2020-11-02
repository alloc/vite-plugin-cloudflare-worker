import etag from 'etag'
import axios from 'axios'
import { UploadConfig } from './config'

export async function uploadScript(code: string, config: UploadConfig) {
  const api = axios.create({
    baseURL: 'https://api.cloudflare.com/client/v4',
    headers: { authorization: 'Bearer ' + config.authToken },
  })

  // 1. Check if the script changed
  const scriptsUri = `/accounts/${config.accountId}/workers/scripts`
  const scriptsRes = (await api.get<Response<WorkerScript[]>>(scriptsUri)).data
  if (!scriptsRes.success) {
    throw Error(scriptsRes.errors[0].message)
  }
  const script = scriptsRes.result.find(script => script.id == config.scriptId)
  if (script && script.etag == etag(code)) {
    return // Nothing changed
  }

  // 2. Upload the script
  const scriptUri = `${scriptsUri}/${config.scriptId}`
  return api.put(scriptUri, code, {
    headers: {
      'content-type': 'application/javascript',
    },
  })
}

type Response<T> = {
  result: T
  success: boolean
  errors: { code: number; message: string }[]
}

type WorkerScript = {
  id: string
  etag: string
}
