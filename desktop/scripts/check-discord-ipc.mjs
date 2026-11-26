import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { DiscordIpcClient, decodeIpcFrames, encodeIpcFrame } from "../src/discord/ipcClient.mjs";

const result = promise => promise.then(value => ({ value }), error => ({ error }));
const activities = peer => peer.connections.flatMap(connection => connection.commands)
  .filter(command => command.cmd === "SET_ACTIVITY" && command.args?.activity);
const subscriptions = connection => connection.commands.filter(command => command.cmd === "SUBSCRIBE");

async function until(check, message) {
  const deadline = Date.now() + 1500;
  while (!check()) {
    assert.ok(Date.now() < deadline, message);
    await delay(5);
  }
}

async function createPeer(t, { autoReady = true, onCommand } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "haykasa-discord-"));
  const endpoint = process.platform === "win32"
    ? `\\\\.\\pipe\\haykasa-discord-${process.pid}-${path.basename(directory)}`
    : path.join(directory, "rpc.sock");
  const peer = { connections: [], autoReady };
  const send = (connection, payload) => {
    if (!connection.socket.destroyed) connection.socket.write(encodeIpcFrame(1, payload));
  };
  peer.ready = connection => send(connection, { cmd: "DISPATCH", evt: "READY", data: {} });
  peer.join = (connection, secret) => send(connection, { cmd: "DISPATCH", evt: "ACTIVITY_JOIN", data: { secret } });
  const server = net.createServer(socket => {
    const connection = { socket, buffer: Buffer.alloc(0), commands: [], handshake: false };
    peer.connections.push(connection);
    socket.on("error", () => {});
    socket.on("data", chunk => {
      connection.buffer = Buffer.concat([connection.buffer, chunk]);
      const decoded = decodeIpcFrames(connection.buffer);
      connection.buffer = decoded.rest;
      for (const frame of decoded.frames) {
        if (frame.opcode === 0) {
          connection.handshake = true;
          if (peer.autoReady) peer.ready(connection);
        } else if (frame.opcode === 1) {
          connection.commands.push(frame.payload);
          if (onCommand?.(connection, frame.payload) !== false) {
            send(connection, { cmd: frame.payload.cmd, nonce: frame.payload.nonce, data: {} });
          }
        }
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(endpoint, resolve);
  });
  const client = new DiscordIpcClient();
  // Only discovery is redirected; the production connect/retry/codec/socket code runs unchanged.
  // Never probe a real Discord pipe or account from these tests.
  const connectPipe = client.connectPipe.bind(client);
  client.connectPipe = (_candidate, ...scope) => connectPipe(endpoint, ...scope);
  t.after(async () => {
    client.disconnect();
    for (const connection of peer.connections) connection.socket.destroy();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { client, peer };
}

test("disconnect cancels a pending handshake and a delayed READY cannot publish", { timeout: 5000 }, async t => {
  const { client, peer } = await createPeer(t, { autoReady: false });
  const publishing = result(client.setActivity({ state: "Before disable" }));
  await until(() => peer.connections[0]?.handshake, "Expected the actual IPC handshake");
  client.disconnect();
  peer.ready(peer.connections[0]);
  const outcome = await publishing;
  await delay(20);
  assert.ok(outcome.error, "The cancelled update must reject");
  assert.equal(client.connected, false);
  assert.equal(client.everConnected, false);
  assert.equal(activities(peer).length, 0);
  assert.equal(peer.connections.length, 1, "Cancellation must not continue scanning pipes");
});

test("disconnect prevents pending activity rejection from starting a fallback retry", { timeout: 5000 }, async t => {
  let held = false;
  const { client, peer } = await createPeer(t, { onCommand: (_connection, command) => {
    if (command.cmd === "SET_ACTIVITY" && !held) { held = true; return false; }
    return true;
  } });
  const publishing = result(client.setActivity({ state: "Before disable", buttons: [{ label: "QA", url: "https://example.test/" }] }));
  await until(() => activities(peer).length === 1, "Expected the initial activity request");
  client.disconnect();
  const outcome = await publishing;
  await delay(20);
  assert.ok(outcome.error, "A disabled operation must not retry a simpler activity");
  assert.equal(client.connected, false);
  assert.equal(peer.connections.length, 1);
  assert.equal(activities(peer).length, 1);
});

test("an active connection can still retry an unsupported activity rendition", { timeout: 5000 }, async t => {
  let rejected = false;
  const { client, peer } = await createPeer(t, { onCommand: (connection, command) => {
    if (command.cmd === "SET_ACTIVITY" && !rejected) {
      rejected = true;
      connection.socket.write(encodeIpcFrame(1, {
        evt: "ERROR", nonce: command.nonce, data: { message: "Synthetic unsupported buttons" },
      }));
      return false;
    }
    return true;
  } });
  await client.setActivity({ state: "Supported fallback", buttons: [{ label: "QA", url: "https://example.test/" }] });
  assert.equal(activities(peer).length, 2);
  assert.equal(activities(peer)[0].args.activity.buttons.length, 1);
  assert.equal(activities(peer)[1].args.activity.buttons, undefined);
  assert.equal(client.connected, true);
});

test("a fresh connection subscribes once to each join event and delivers joins", { timeout: 5000 }, async t => {
  const { client, peer } = await createPeer(t);
  const joins = [];
  client.onJoin(secret => joins.push(secret));
  await client.setActivity({ state: "First socket" });
  await until(() => subscriptions(peer.connections[0]).length === 2, "Expected the first socket's subscriptions");
  peer.connections[0].socket.destroy();
  await until(() => !client.connected, "Expected the natural socket close");
  await client.setActivity({ state: "Reconnected socket" });
  await until(() => peer.connections[1] && subscriptions(peer.connections[1]).length === 2, "A reconnect must subscribe on the new socket");
  assert.deepEqual(subscriptions(peer.connections[1]).map(command => command.evt), ["ACTIVITY_JOIN", "ACTIVITY_JOIN_REQUEST"]);
  peer.join(peer.connections[1], "QA-JOIN");
  await until(() => joins.length === 1, "The new connection must deliver join events");
  assert.deepEqual(joins, ["QA-JOIN"]);
  await client.setActivity({ state: "Same socket" });
  await delay(20);
  assert.equal(subscriptions(peer.connections[1]).length, 2);
});

test("a new explicit update can connect while the cancelled handshake settles", { timeout: 5000 }, async t => {
  const { client, peer } = await createPeer(t, { autoReady: false });
  const oldUpdate = result(client.setActivity({ state: "Old request" }));
  await until(() => peer.connections[0]?.handshake, "Expected the old handshake");
  client.disconnect();
  const newUpdate = result(client.setActivity({ state: "New explicit request" }));
  const connecting = client.connecting;
  await until(() => peer.connections[1]?.handshake, "The new request must have its own handshake");
  assert.ok((await oldUpdate).error);
  assert.equal(client.connecting, connecting, "The old finally handler must not clear the new connection promise");
  peer.ready(peer.connections[1]);
  assert.equal((await newUpdate).error, undefined);
  assert.deepEqual(activities(peer).map(command => command.args.activity.state), ["New explicit request"]);
});

test("the desktop disable clear/disconnect sequence does not await a reconnect", { timeout: 5000 }, async t => {
  const { client, peer } = await createPeer(t);
  await client.setActivity({ state: "Established connection" });
  await until(() => subscriptions(peer.connections[0]).length === 2, "Expected initial subscriptions");
  peer.connections[0].socket.destroy();
  await until(() => !client.connected, "Expected socket loss");
  peer.autoReady = false;
  const publishing = result(client.setActivity({ state: "Pending reconnect" }));
  await until(() => peer.connections[1]?.handshake, "Expected the pending reconnect");
  // This is the existing main-process opt-out sequence.
  const disabling = client.clearActivity().catch(() => {}).then(() => client.disconnect());
  await until(() => client.connecting === null, "Clearing a closed connection must not wait for or open another one");
  await disabling;
  assert.ok((await publishing).error);
  assert.equal(client.connected, false);
  assert.equal(activities(peer).length, 1);
});

test("clear acknowledgement cannot let a rejected old update retry before desktop disconnect", { timeout: 5000 }, async t => {
  let held;
  const { client, peer } = await createPeer(t, { onCommand: (connection, command) => {
    if (command.cmd !== "SET_ACTIVITY") return true;
    if (command.args?.activity && !held) { held = command; return false; }
    if (!command.args?.activity) {
      connection.socket.write(Buffer.concat([
        encodeIpcFrame(1, { cmd: command.cmd, nonce: command.nonce, data: {} }),
        encodeIpcFrame(1, { evt: "ERROR", nonce: held.nonce, data: { message: "Synthetic late activity rejection" } }),
      ]));
      return false;
    }
    return true;
  } });
  const publishing = result(client.setActivity({ state: "Before disable", buttons: [{ label: "QA", url: "https://example.test/" }] }));
  await until(() => activities(peer).length === 1, "Expected the old in-flight activity");
  await client.clearActivity().catch(() => {}).then(() => client.disconnect());
  await publishing;
  assert.equal(activities(peer).length, 1, "The cleared activity cannot retry while disable awaits its clear acknowledgement");
  assert.equal(client.connected, false);
});

test("clear intent cancels old updates before its ACK and preserves a later enabled update", { timeout: 5000 }, async t => {
  let oldActivity, clearCommand;
  const { client, peer } = await createPeer(t, { onCommand: (connection, command) => {
    if (command.cmd !== "SET_ACTIVITY") return true;
    if (command.args?.activity && !oldActivity) { oldActivity = command; return false; }
    if (!command.args?.activity) {
      clearCommand = { connection, command };
      // The clear is deliberately still pending when the old update rejects.
      connection.socket.write(encodeIpcFrame(1, { evt: "ERROR", nonce: oldActivity.nonce, data: { message: "Synthetic old update rejection" } }));
      return false;
    }
    return true;
  } });
  const publishing = result(client.setActivity({ state: "Before clear", buttons: [{ label: "QA", url: "https://example.test/" }] }));
  await until(() => activities(peer).length === 1, "Expected the old pending activity");
  const clearing = result(client.clearActivity());
  await until(() => clearCommand, "Expected a real clear command on the connected socket");
  assert.ok((await publishing).error, "Clear intent must invalidate the old update before its own ACK");
  assert.equal(activities(peer).length, 1);
  clearCommand.connection.socket.write(encodeIpcFrame(1, { cmd: "SET_ACTIVITY", nonce: clearCommand.command.nonce, data: {} }));
  assert.equal((await clearing).error, undefined);
  assert.equal(client.connected, true, "A connected clear remains a legitimate RPC");
  await client.setActivity({ state: "New enabled update" });
  assert.deepEqual(activities(peer).map(command => command.args.activity.state), ["Before clear", "New enabled update"]);
});

test("clear before READY cancels the pending connection without publishing", { timeout: 5000 }, async t => {
  const { client, peer } = await createPeer(t, { autoReady: false });
  const publishing = result(client.setActivity({ state: "Pending initial connection" }));
  await until(() => peer.connections[0]?.handshake, "Expected the pending connection");
  await client.clearActivity();
  peer.ready(peer.connections[0]);
  assert.ok((await publishing).error);
  assert.equal(client.connected, false);
  assert.equal(client.everConnected, false);
  assert.equal(activities(peer).length, 0);
});

test("a connected clear preserves an in-flight join subscription", { timeout: 5000 }, async t => {
  let heldSubscription;
  const { client, peer } = await createPeer(t, { onCommand: (connection, command) => {
    if (command.cmd === "SUBSCRIBE" && !heldSubscription) {
      heldSubscription = { connection, command };
      return false;
    }
    return true;
  } });
  const joins = [];
  client.onJoin(secret => joins.push(secret));
  await client.setActivity({ state: "Before clear" });
  await until(() => heldSubscription, "Expected a subscription awaiting its ACK");
  await client.clearActivity();
  const { connection, command } = heldSubscription;
  connection.socket.write(encodeIpcFrame(1, { cmd: "SUBSCRIBE", nonce: command.nonce, data: {} }));
  await until(() => subscriptions(connection).length === 2, "The second join subscription must follow its first ACK");
  peer.join(connection, "QA-AFTER-CLEAR");
  await until(() => joins.length === 1, "Clearing activity must not cancel connection-owned subscriptions");
  assert.deepEqual(joins, ["QA-AFTER-CLEAR"]);
  assert.equal(client.connected, true);
});
