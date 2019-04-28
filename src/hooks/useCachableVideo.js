import React from 'react'
import useOnlineStatus from './useOnlineStatus'
import {db} from '../db'
import axios from 'axios'
import filesize from 'filesize'

const putVideo = async (id, blob) => {
  await db.put({
    _id: id,
    _attachments: {
      'movie.mp4': {
        content_type: 'video/mp4',
        data: blob,
      },
    },
  })
  return db.getAttachment(id, 'movie.mp4')
}

export function createRemoteUrl(video) {
  if (video.provider === 'digitalocean') {
    return (
      process.env.REACT_APP_SPACES_URL + '/' + video.url.split('/').reverse()[0]
    )
  }
  if (video.provider === 'local') {
    return process.env.REACT_APP_LOCAL_URL + '/' + video.url
  }
  return video.url
}

function useCachableVideo({id, video}) {
  const [url, setUrl] = React.useState(null)
  const [realSize, setSize] = React.useState(0)
  const [source, setSource] = React.useState(axios.CancelToken.source())
  const size = realSize ? filesize(realSize, {round: 0}) : null
  const remoteUrl = createRemoteUrl(video)
  const [progress, setProgress] = React.useState(null)
  const online = useOnlineStatus()
  const [isDownloading, setIsDownloading] = React.useState(false)
  const setBlob = blob => {
    setSize(blob.size)
    const newUrl = URL.createObjectURL(blob)
    setUrl(newUrl)
  }
  const checkCached = async () => {
    const cachedBlob = await db.getAttachment(id, 'movie.mp4')
    if (cachedBlob) {
      setBlob(cachedBlob)
    }
  }
  const download = async () => {
    setIsDownloading(true)
    try {
      const blob = await axios({
        url: remoteUrl,
        method: 'GET',
        responseType: 'blob',
        onDownloadProgress: progressEvent => {
          const progress = (progressEvent.loaded / progressEvent.total) * 100
          setProgress(progress === 100 ? null : progress)
        },
        cancelToken: source.token,
      }).then(response => {
        return new Blob([response.data])
      })
      const newBlob = await putVideo(id, blob)
      setBlob(newBlob)
      setIsDownloading(false)
    } catch (error) {
      setIsDownloading(false)
      if (axios.isCancel(error)) {
        setProgress(null)
        throw error
      }
    }
  }
  const removeCachedVideo = async () => {
    try {
      const doc = await db.get(id)
      await db.remove(doc)
      setUrl(null)
      setSize(0)
    } catch (e) {
      console.log('err', e)
    }
  }
  const cancelDownload = async () => {
    source.cancel('Cancelled by user')
    setSource(axios.CancelToken.source())
  }
  React.useEffect(() => {
    checkCached()
  }, [])
  return {
    download,
    online,
    url,
    isDownloading,
    removeCachedVideo,
    progress,
    size,
    cancelDownload,
  }
}

export default useCachableVideo
