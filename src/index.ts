import "dotenv/config"
import { generateToken, serverUrl, apiKey, apiSecret } from "./tokens";
import { Participant, RemoteParticipant, Room, RoomEvent, TrackKind, TrackSource, TrackPublication, RemoteTrackPublication, Track, VideoStream, AudioStream } from "@livekit/rtc-node";
import { RoomServiceClient } from "livekit-server-sdk";
import { convertFrameToWebP } from "./convertToWebP";

const ROOM_NAME="runawayMemoryLeak"

const main = async () => {
  if (!serverUrl) {
    throw new Error("NEXT_PUBLIC_LIVEKIT_URL is not set")
  }

  const roomService = new RoomServiceClient(
    serverUrl,
    apiKey,
    apiSecret
  );

  const [listedRoom] = await roomService.listRooms([ROOM_NAME])

  if (listedRoom == null) {
    console.log('creating room', { room: ROOM_NAME, allowAutoEgress: false })
    await roomService.createRoom({
      name: ROOM_NAME,
    })
  } else {
    console.log('room exists', { room: ROOM_NAME, allowAutoEgress: false })
  }

  const serverToken = await generateToken("runawayMemoryLeak", "server");

  const participantToken = await generateToken("runawayMemoryLeak", "human");

  console.log("USE THESE TO JOIN: livekit url: ", process.env.NEXT_PUBLIC_LIVEKIT_URL, "\nparticipant token: ", participantToken);
  console.log("\nVisit a 'video conference sandbox' and use the custom connect with the above info, hit enter when you're connected as 'human'");
  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });

  

  const room = new Room()
  await room.connect(serverUrl, serverToken, { dynacast: true, autoSubscribe: false })

  const getHuman = async (): Promise<RemoteParticipant> => {
    if (!room?.remoteParticipants) {
      console.warn('no remote participants, waiting for spark')
      await waitForHuman()
      return getHuman()
    }
    const participants = Array.from(room.remoteParticipants.entries())
    const human = participants.find(p => p[1].identity === 'human')?.[1]
    if (!human) {
      console.info('no human found, waiting for human')
      await waitForHuman()
      return getHuman()
    }
    return human
  }

  const waitForHuman = async (): Promise<void> => {
    return new Promise<void>((resolve) => {
      const onParticipantConnected = (participant: Participant) => {
        if (participant.identity === 'human') {
          console.info('human connected')
          room?.off(RoomEvent.ParticipantConnected, onParticipantConnected)
          resolve()
        }
      }
      room?.on(RoomEvent.ParticipantConnected, onParticipantConnected)
    })
  }

  const getVideoStream = async (): Promise<VideoStream | null> => {
    try {
      const human = await getHuman()

      let videoTrackPublication = Array.from(human.trackPublications.values()).find(publication => [TrackKind.KIND_VIDEO, "KIND_VIDEO"].includes(publication.kind || '') && publication.source === TrackSource.SOURCE_CAMERA)
      if (!videoTrackPublication) {
        console.warn(`No video track found for participant ${human.identity}`)
        videoTrackPublication = await new Promise((resolve) => {
          const onPublication = async (publication: TrackPublication, participant: Participant) => {
            if (publication.kind === TrackKind.KIND_VIDEO && publication.source === TrackSource.SOURCE_CAMERA) {
              console.info("video track published", { publication })
              room.off(RoomEvent.TrackPublished, onPublication)
              resolve(publication as RemoteTrackPublication)
            }
          }
          room.on(RoomEvent.TrackPublished, onPublication)
        })
      }

      if (!videoTrackPublication) {
        console.warn(`No video track found for participant ${human.identity}`)
        return null
      }

      videoTrackPublication.setSubscribed(true)

      let track: Track | undefined = videoTrackPublication.track

      if (!track) {
        track = await new Promise((resolve) => {
          console.warn("no track found, waiting for track subscribed")
          room.on(RoomEvent.TrackSubscribed, async (track, _publication, participant) => {
            console.log('subscribed to track', track.sid, participant.identity, track.kind);
            resolve(track)
          });
        })
        if (!track) {
          console.warn(`No track found for video track publication ${videoTrackPublication.sid}`)
          throw new Error('no track found')
        }
      }

      const stream = new VideoStream(track)

      return stream
    } catch (error) {
      console.error("error getting video stream", { error, alert: true })
      throw error
    }
  }

  const getAudioStream = async (): Promise<AudioStream | null> => {
    try {
      const human = await getHuman()

      let audioTrackPublication = Array.from(human.trackPublications.values()).find(publication => 
        [TrackKind.KIND_AUDIO, "KIND_AUDIO"].includes(publication.kind || '') && 
        publication.source === TrackSource.SOURCE_MICROPHONE
      )
      
      if (!audioTrackPublication) {
        console.warn(`No audio track found for participant ${human.identity}`)
        audioTrackPublication = await new Promise((resolve) => {
          const onPublication = async (publication: TrackPublication, participant: Participant) => {
            if (publication.kind === TrackKind.KIND_AUDIO && publication.source === TrackSource.SOURCE_MICROPHONE) {
              console.info("audio track published", { publication })
              room.off(RoomEvent.TrackPublished, onPublication)
              resolve(publication as RemoteTrackPublication)
            }
          }
          room.on(RoomEvent.TrackPublished, onPublication)
        })
      }

      if (!audioTrackPublication) {
        console.warn(`No audio track found for participant ${human.identity}`)
        return null
      }

      audioTrackPublication.setSubscribed(true)

      let track: Track | undefined = audioTrackPublication.track

      if (!track) {
        track = await new Promise((resolve) => {
          console.warn("no track found, waiting for track subscribed")
          room.on(RoomEvent.TrackSubscribed, async (track, _publication, participant) => {
            console.log('subscribed to track', track.sid, participant.identity, track.kind);
            resolve(track)
          });
        })
        if (!track) {
          console.warn(`No track found for audio track publication ${audioTrackPublication.sid}`)
          throw new Error('no track found')
        }
      }

      const stream = new AudioStream(track)
      return stream
    } catch (error) {
      console.error("error getting audio stream", { error, alert: true })
      throw error
    }
  }

  const stream = await getVideoStream()
  if (!stream) {
    console.error("no stream found")
    throw new Error("no stream found")
  }

  setInterval(() => {
    Bun.gc(true)
  }, 1000)

  let i = 0
  for await (const frame of stream) {
    i++;
    if (i % 200 === 0) {
      // const webP = await convertFrameToWebP(frame.frame)
      // await Bun.write(`./frames/${i}.webp`, webP)
      console.log("frame", i, frame.frame.data.length)
    }
  }
}

main().then(() => {
  console.log("OK")
}).catch((err) => {
  console.error(err)
})
