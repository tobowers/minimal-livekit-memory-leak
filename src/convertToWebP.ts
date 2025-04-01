import { type VideoFrame, VideoBufferType } from '@livekit/rtc-node'
import sharp from 'sharp'

export async function convertFrameToWebP(frame: VideoFrame): Promise<Buffer> {

  if (frame.type !== VideoBufferType.RGB24) {
    frame = frame.convert(VideoBufferType.RGB24)
  }

  const { width, height, data } = frame

  return await sharp(data, {
    raw: {
      width,
      height,
      channels: 3,
    }
  })
    .flip()
    .resize({
      width: 512,
      height: 512,
      fit: 'inside'
    })
    .webp({
      quality: 90
    })
    .toBuffer()
}
