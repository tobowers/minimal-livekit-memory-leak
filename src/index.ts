import "dotenv/config"
import { generateToken } from "./tokens";
import { Participant, RemoteParticipant, Room, RoomEvent, TrackKind, TrackSource, TrackPublication, RemoteTrackPublication, Track, VideoStream } from "@livekit/rtc-node";

const main = async () => {
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL
  if (!serverUrl) {
    throw new Error("NEXT_PUBLIC_LIVEKIT_URL is not set")
  }

  const serverToken = await generateToken("runawayMemoryLeak", "server");

  const participantToken = await generateToken("runawayMemoryLeak", "human");

  console.log("USE THESE TO JOIN: livekit url: ", process.env.NEXT_PUBLIC_LIVEKIT_URL, "\nparticipant token: ", participantToken);
  console.log("\nVisit a 'video conference sandbox' and use the manual connect with the above info, hit enter when you're connected as 'human'");
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

  const stream = await getVideoStream()
  if (!stream) {
    console.error("no stream found")
    throw new Error("no stream found")
  }
  for await (const frame of stream) {
    console.log(".")
  }
}

main().then(() => {
  console.log("OK")
}).catch((err) => {
  console.error(err)
})
