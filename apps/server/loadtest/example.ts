import { Client, Room } from "@colyseus/sdk";
import { cli, Options } from "@colyseus/loadtest";

export async function main(options: Options) {
  const client = new Client(options.endpoint);
  // A table seats an account once, so each client needs its own Better Auth session.
  const token = process.env.LOADTEST_SESSION_TOKENS?.split(",")[options.clientId];
  if (!token) throw new Error("Set LOADTEST_SESSION_TOKENS to one comma-separated Better Auth session per client.");
  client.auth.token = token;
  const room: Room = await client.joinOrCreate(options.roomName, {
    // your join options here...
  });

  console.log("joined successfully!");

  room.onMessage("message-type", (payload: any) => {
    // logic
  });

  room.onStateChange((state: any) => {
    console.log("state change:", state);
  });

  room.onLeave((code: number) => {
    console.log("left");
  });
}

cli(main);
