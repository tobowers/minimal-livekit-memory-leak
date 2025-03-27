import 'dotenv/config'
import { AccessToken } from 'livekit-server-sdk';

const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET

export const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL

export function generateToken(roomName: string, participantName: string) {
  validateEnv()

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
  });
  at.addGrant({ 
    roomCreate: true,
    roomJoin: true, 
    room: roomName,
    roomRecord: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
    canSubscribeMetrics: true,
  });

  return at.toJwt();
}

function validateEnv() {
  if (!apiKey || !apiSecret) {
    throw new Error('LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set')
  }
}
