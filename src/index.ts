import "dotenv/config"
import { generateToken } from "./tokens";
import { Participant, RemoteParticipant, Room, RoomEvent } from "@livekit/rtc-node";

const main = async () => {
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL!

  const serverToken = await generateToken("test-runaway-memory", "server");

  const participantToken = await generateToken("test-runaway-memory", "human");
  
  console.log("USE THESE TO JOIN: livekit url: ", process.env.NEXT_PUBLIC_LIVEKIT_URL, "\nparticipant token: ", participantToken);
  
  const room = new Room()
  await room.connect(serverUrl, serverToken, { dynacast: true, autoSubscribe: false })
  
  const getHuman = async (): Promise<RemoteParticipant> {
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

  const waitForHuman = async () {
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


}

main().then(() => {
  console.log("OK")
}).catch((err) => {
  console.error(err)
})
