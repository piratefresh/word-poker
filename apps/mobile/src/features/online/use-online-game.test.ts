import { act, renderHook } from "@testing-library/react-native";

import {
  GAME_EVENTS,
  GAME_MESSAGES,
  type LetterTile,
  type Tile,
} from "@wordpoker/contracts";

import { testDictionary } from "@/test-support/dictionary-fixtures";
import { useOnlineGame, type GameRoomLike, type OnlineGame } from "./use-online-game";

// The HUD barrel reaches the motion loop gate, which imports expo-router — a navigation package
// Jest cannot parse. Nothing here renders a screen, so the gate's hook has nothing to do.
jest.mock("expo-router", () => ({ useFocusEffect: () => undefined }));

const HERO = "hero-sess";
const OPPONENT = "opp-sess";

/** The hero's two tiles, spelling GO — the one word the fixture dictionary knows. */
const RACK: readonly Tile[] = [
  { id: "t-g", letter: "G", points: 2 } satisfies LetterTile,
  { id: "t-o", letter: "O", points: 1 } satisfies LetterTile,
];

/** A controllable stand-in for a Colyseus `Room`: it records `send`s and replays state/messages. */
interface FakeRoom extends GameRoomLike {
  emitState(next: Record<string, unknown>): void;
  emit(name: string, payload: unknown): void;
  readonly sends: { type: string; payload: unknown }[];
}

function makeRoom(sessionId: string, initial: Record<string, unknown>): FakeRoom {
  const stateListeners = new Set<(state: unknown) => void>();
  const messageListeners = new Map<string, Set<(payload: unknown) => void>>();
  const sends: { type: string; payload: unknown }[] = [];
  let state: unknown = initial;

  const onStateChange = Object.assign(
    (cb: (state: unknown) => void) => {
      stateListeners.add(cb);
      return { remove: () => stateListeners.delete(cb) };
    },
    { remove: (cb: (state: unknown) => void) => stateListeners.delete(cb) },
  );

  return {
    sessionId,
    get state() {
      return state;
    },
    onStateChange: onStateChange as GameRoomLike["onStateChange"],
    onMessage(name, cb) {
      const set = messageListeners.get(name) ?? new Set();
      set.add(cb);
      messageListeners.set(name, set);
      return () => set.delete(cb);
    },
    send(type, payload) {
      sends.push({ type, payload });
    },
    emitState(next) {
      state = next;
      stateListeners.forEach((cb) => cb(next));
    },
    emit(name, payload) {
      messageListeners.get(name)?.forEach((cb) => cb(payload));
    },
    sends,
  };
}

/** One public seat, as the broadcast schema carries it. */
function seat(playerId: string, index: number, over: Record<string, unknown> = {}) {
  return {
    seat: index,
    playerId,
    connected: true,
    tableStack: 5_000,
    committedThisRound: 0,
    committedThisHand: 0,
    isAllIn: false,
    hasFolded: false,
    sittingOut: false,
    actedThisRound: false,
    ...over,
  };
}

/** A live preflop hand with the hero to act facing no bet, in the shape `decodeRoom` reads. */
function liveState(over: Record<string, unknown> = {}) {
  return {
    table: { name: "Felt", buyIn: 5_000, smallBlind: 50, bigBlind: 100, maxSeats: 6 },
    phase: "preflop",
    handCount: 1,
    dealerSeat: 0,
    toActSeat: 0,
    turnDeadline: 0,
    seats: new Map<string, unknown>([
      [HERO, seat(HERO, 0)],
      [OPPONENT, seat(OPPONENT, 1)],
    ]),
    community: [],
    betting: { active: true, currentBet: 0, minRaise: 100, bigBlind: 100 },
    pots: [{ amount: 0 }],
    wordWindow: { active: false, status: "none", slots: [] },
    result: { available: false, standings: [] },
    ...over,
  };
}

/** The hero's private state as the room targets it: its rack and whose turn it is. */
function privateState(over: Record<string, unknown> = {}) {
  return {
    now: 0,
    playerId: HERO,
    seat: 0,
    tableStack: 5_000,
    hand: 1,
    rack: RACK.map((tile) => ({ ...tile })),
    word: { status: "none", draft: null, confirmed: null },
    isYourTurn: true,
    turnDeadline: 0,
    ...over,
  };
}

type Handle = { current: OnlineGame };

async function mount(room: FakeRoom): Promise<Handle> {
  const dictionary = testDictionary(["GO"]);
  const { result } = await renderHook(() => useOnlineGame({ room, dictionary }));
  return result as Handle;
}

describe("useOnlineGame", () => {
  test("maps the broadcast into the felt's state, the hero in its own seat", async () => {
    const room = makeRoom(HERO, liveState());
    const handle = await mount(room);
    await act(async () => room.emit(GAME_EVENTS.privateState, privateState()));

    const game = handle.current.game;
    expect(game).not.toBeNull();
    expect(game?.seatCount).toBe(6);
    expect(game?.players[0]?.id).toBe(HERO);
    expect(game?.players[0]?.isHero).toBe(true);
    expect(game?.players[0]?.status).toBe("your-turn");
    expect(game?.players[1]?.isHero).toBeFalsy();
    expect(game?.privateTiles).toHaveLength(2);
  });

  test("never pairs the next hand's rack with the last hand's board", async () => {
    // The room sends the new rack as a message the moment it deals, and the new board a patch
    // later: for that tick the old board can hold a tile the reshuffled bag just dealt the hero.
    const board = [{ id: "t-g", letter: "G", points: 2 }, { id: "t-x", letter: "X", points: 8 }];
    const room = makeRoom(HERO, liveState({ phase: "payout", community: board }));
    const handle = await mount(room);
    await act(async () => room.emit(GAME_EVENTS.privateState, privateState({ hand: 2 })));

    const between = handle.current.game;
    const ids = [...(between?.privateTiles ?? []), ...(between?.community ?? [])].map(
      (tile) => tile?.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(between?.privateTiles).toHaveLength(0);

    // The patch lands: the board is the new hand's, and the rack is back beside it.
    await act(async () => room.emitState(liveState({ handCount: 2 })));
    expect(handle.current.game?.privateTiles.map((tile) => tile.id)).toEqual(["t-g", "t-o"]);
  });

  test("maps the room's payout into the results screen's snapshot, and no seed (STO-430)", async () => {
    const standing = (playerId: string, seatIndex: number, place: number, over = {}) => ({
      playerId,
      seat: seatIndex,
      score: 0,
      place,
      decidedBy: "final-score",
      compared: 0,
      hasCompared: false,
      word: "",
      reason: "",
      tiles: [],
      base: 0,
      mult: 0,
      rack: 0,
      ...over,
    });
    const room = makeRoom(
      HERO,
      liveState({
        phase: "payout",
        toActSeat: -1,
        betting: { active: false },
        result: {
          available: true,
          winner: HERO,
          standings: [
            standing(HERO, 0, 1, {
              score: 3,
              word: "GO",
              tiles: RACK.map((tile) => ({ ...tile, kind: "letter" })),
              base: 3,
            }),
            standing(OPPONENT, 1, 2, { reason: "not-a-word" }),
          ],
          pots: [{ amount: 200 }, { amount: 50 }],
        },
      }),
    );
    const handle = await mount(room);
    await act(async () => room.emit(GAME_EVENTS.privateState, privateState()));

    const results = handle.current.results;
    expect(results?.hand).toBe(1);
    expect(results?.seed).toBeNull();
    expect(results?.pot).toBe(250);
    expect(results?.seats.map((seat) => seat.playerId)).toEqual([HERO, OPPONENT]);
    expect(results?.seats[0]).toMatchObject({
      word: "GO",
      total: 3,
      base: 3,
      takesPot: true,
      isYou: true,
      decidedBy: "final-score",
    });
    expect(results?.seats[0]?.tiles.map((tile) => tile.id)).toEqual(["t-g", "t-o"]);
    expect(results?.seats[1]).toMatchObject({ word: null, reason: "not-a-word", takesPot: false });

    // The next deal clears the broadcast's result, and the results with it.
    await act(async () => room.emitState(liveState({ handCount: 2 })));
    expect(handle.current.results).toBeNull();
  });

  test("arms the action row from the engine's bounds when it is the hero's turn", async () => {
    const room = makeRoom(HERO, liveState());
    const handle = await mount(room);
    await act(async () => room.emit(GAME_EVENTS.privateState, privateState()));

    // No bet is out and the hero is first to act: it may check or open, but not call or raise.
    const betting = handle.current.game?.betting;
    expect(betting?.canCheck).toBe(true);
    expect(betting?.canBet).toBe(true);
    expect(betting?.canRaise).toBe(false);
    expect(betting?.callAmount).toBeUndefined();
    expect(betting?.allInAmount).toBe(5_000);
  });

  test("leaves the row inert when it is not the hero's turn", async () => {
    const room = makeRoom(HERO, liveState({ toActSeat: 1 }));
    const handle = await mount(room);
    await act(async () => room.emit(GAME_EVENTS.privateState, privateState({ isYourTurn: false })));

    const betting = handle.current.game?.betting;
    expect(betting?.canCheck).toBe(false);
    expect(betting?.canBet).toBe(false);
    expect(betting?.canAllIn).toBe(false);
  });

  test("dispatches each seat action to the room as its contracts message", async () => {
    const room = makeRoom(HERO, liveState());
    const handle = await mount(room);

    await act(async () => handle.current.fold());
    await act(async () => handle.current.check());
    await act(async () => handle.current.call());
    await act(async () => handle.current.allIn());
    await act(async () => handle.current.bet(300));
    await act(async () => handle.current.raiseTo(600));

    expect(room.sends).toEqual([
      { type: GAME_MESSAGES.betting, payload: { type: "fold" } },
      { type: GAME_MESSAGES.betting, payload: { type: "check" } },
      { type: GAME_MESSAGES.betting, payload: { type: "call" } },
      { type: GAME_MESSAGES.betting, payload: { type: "allIn" } },
      { type: GAME_MESSAGES.betting, payload: { type: "bet", amount: 300 } },
      { type: GAME_MESSAGES.betting, payload: { type: "raise", amount: 600 } },
    ]);
  });

  test("opens an unbet round with the felt's wager as a bet, never a raise the room refuses", async () => {
    const room = makeRoom(HERO, liveState());
    const handle = await mount(room);
    await act(async () => room.emit(GAME_EVENTS.privateState, privateState()));
    expect(handle.current.game?.betting.canBet).toBe(true);

    await act(async () => handle.current.wager(300));

    expect(room.sends).toEqual([{ type: GAME_MESSAGES.betting, payload: { type: "bet", amount: 300 } }]);
  });

  test("sends a draft built during betting when the word window opens", async () => {
    const room = makeRoom(HERO, liveState());
    const handle = await mount(room);
    await act(async () => room.emit(GAME_EVENTS.privateState, privateState()));

    const plays = RACK.map((tile) => ({ tileId: tile.id }));
    await act(async () => handle.current.setDraft(plays));

    expect(handle.current.words?.word).toBe("GO");
    expect(room.sends).not.toContainEqual({
      type: GAME_MESSAGES.draftWord,
      payload: { submission: { plays } },
    });

    await act(async () =>
      room.emitState(
        liveState({
          phase: "river",
          toActSeat: -1,
          betting: { active: false },
          wordWindow: {
            active: true,
            status: "open",
            slots: [{ playerId: HERO, status: "drafting" }],
          },
        }),
      ),
    );

    expect(room.sends).toContainEqual({
      type: GAME_MESSAGES.draftWord,
      payload: { submission: { plays } },
    });

    await act(async () =>
      room.emit(
        GAME_EVENTS.privateState,
        privateState({
          isYourTurn: false,
          word: { status: "drafting", draft: { plays }, confirmed: null },
        }),
      ),
    );
    expect(handle.current.words?.confirmable).toBe(true);
  });

  test("builds the word the whole hand and locks it in only on confirm", async () => {
    const wordOpen = liveState({
      betting: { active: false, currentBet: 0, minRaise: 100, bigBlind: 100 },
      toActSeat: -1,
      wordWindow: { active: true, status: "open", slots: [{ playerId: HERO, status: "drafting" }] },
    });
    const room = makeRoom(HERO, wordOpen);
    const handle = await mount(room);
    await act(async () =>
      room.emit(GAME_EVENTS.privateState, privateState({ word: { status: "drafting", draft: null, confirmed: null } })),
    );

    const plays = RACK.map((tile) => ({ tileId: tile.id }));
    await act(async () => handle.current.setDraft(plays));

    // The draft is judged for the live preview and, since the window is open, dispatched to the room.
    expect(handle.current.words?.word).toBe("GO");
    expect(handle.current.words?.reason).toBeNull();
    expect(handle.current.words?.confirmable).toBe(true);
    expect(room.sends).toContainEqual({
      type: GAME_MESSAGES.draftWord,
      payload: { submission: { plays } },
    });

    await act(async () => handle.current.confirmWord());
    expect(room.sends).toContainEqual({
      type: GAME_MESSAGES.confirmWord,
      payload: { submission: { plays } },
    });

    // Optimistically confirmed the instant it is locked in — the builder closes before the server
    // echoes, so the check cannot fire a second time — and the server's own confirmation reconciles
    // the same answer.
    expect(handle.current.words?.confirmed).toBe(true);
    expect(handle.current.words?.confirmable).toBe(false);

    await act(async () =>
      room.emit(GAME_EVENTS.privateState, privateState({ word: { status: "confirmed", draft: null, confirmed: { plays } } })),
    );
    expect(handle.current.words?.confirmed).toBe(true);
  });

  test("shows the hero's move at once and darkens the row before the server echoes", async () => {
    const room = makeRoom(HERO, liveState());
    const handle = await mount(room);
    await act(async () => room.emit(GAME_EVENTS.privateState, privateState()));

    await act(async () => handle.current.fold());

    // The tap is spent: the seat wears the fold and the row goes dark, so nothing invites a second
    // action while the prediction stands — the server has not answered yet.
    expect(handle.current.game?.players[0]?.status).toBe("fold");
    expect(handle.current.game?.betting.canFold).toBe(false);
    expect(handle.current.game?.betting.canCheck).toBe(false);
  });

  test.each(["bet", "raise"] as const)("shows the pending %s amount and reconciles with the broadcast", async (action) => {
    const originalAmount = action === "raise" ? 100 : 0;
    const room = makeRoom(HERO, liveState({
      seats: new Map([
        [HERO, seat(HERO, 0, { committedThisRound: originalAmount })],
        [OPPONENT, seat(OPPONENT, 1)],
      ]),
    }));
    const handle = await mount(room);
    await act(async () => room.emit(GAME_EVENTS.privateState, privateState()));

    await act(async () => action === "bet" ? handle.current.bet(600) : handle.current.raiseTo(600));
    expect(handle.current.game?.players[0]).toMatchObject({ status: action, bet: 600 });
    expect(handle.current.game?.players[1]?.bet).toBeUndefined();

    await act(async () => room.emitState(liveState({
      toActSeat: 1,
      seats: new Map([
        [HERO, seat(HERO, 0, { committedThisRound: 600, committedThisHand: 600, actedThisRound: true })],
        [OPPONENT, seat(OPPONENT, 1)],
      ]),
      betting: { active: true, currentBet: 600, minRaise: 600, bigBlind: 100 },
    })));
    expect(handle.current.game?.players[0]).toMatchObject({ status: "waiting", bet: 600 });

    await act(async () => room.emitState(liveState({ handCount: 2 })));
    expect(handle.current.game?.players[0]?.bet).toBeUndefined();
  });

  test("restores the previous commitment when a pending raise is rejected", async () => {
    const room = makeRoom(HERO, liveState({
      seats: new Map([
        [HERO, seat(HERO, 0, { committedThisRound: 100 })],
        [OPPONENT, seat(OPPONENT, 1)],
      ]),
    }));
    const handle = await mount(room);
    await act(async () => room.emit(GAME_EVENTS.privateState, privateState()));
    await act(async () => handle.current.raiseTo(600));
    expect(handle.current.game?.players[0]).toMatchObject({ status: "raise", bet: 600 });

    await act(async () => room.emit(GAME_EVENTS.rejected, { action: "betting", reason: "not-your-turn" }));
    expect(handle.current.game?.players[0]).toMatchObject({ status: "your-turn", bet: 100 });
  });

  test("reconciles to the server and re-arms the row when the broadcast moves", async () => {
    const room = makeRoom(HERO, liveState());
    const handle = await mount(room);
    await act(async () => room.emit(GAME_EVENTS.privateState, privateState()));
    await act(async () => handle.current.check());
    expect(handle.current.game?.betting.canCheck).toBe(false);

    // The next hand arrives with a bet to the hero: the spent prediction drops and the row is armed
    // from the engine's bounds again — no stuck optimistic state.
    const next = liveState({
      handCount: 2,
      seats: new Map<string, unknown>([
        [HERO, seat(HERO, 0)],
        [OPPONENT, seat(OPPONENT, 1, { committedThisRound: 100, committedThisHand: 100 })],
      ]),
      betting: { active: true, currentBet: 100, minRaise: 100, bigBlind: 100 },
    });
    await act(async () => room.emitState(next));
    await act(async () => room.emit(GAME_EVENTS.privateState, privateState({ hand: 2 })));

    expect(handle.current.game?.betting.canFold).toBe(true);
    expect(handle.current.game?.betting.callAmount).toBe(100);
  });

  test("drops the prediction when the server rejects the move", async () => {
    const room = makeRoom(HERO, liveState());
    const handle = await mount(room);
    await act(async () => room.emit(GAME_EVENTS.privateState, privateState()));
    await act(async () => handle.current.bet(300));
    expect(handle.current.game?.betting.canBet).toBe(false);

    await act(async () => room.emit(GAME_EVENTS.rejected, { action: "betting", reason: "not-your-turn" }));

    // The row comes back for another try rather than sitting dark behind a move that never landed.
    expect(handle.current.game?.betting.canCheck).toBe(true);
    expect(handle.current.game?.betting.canBet).toBe(true);
  });

  test("surfaces a server word rejection as the draft's reason", async () => {
    const wordOpen = liveState({
      betting: { active: false, currentBet: 0, minRaise: 100, bigBlind: 100 },
      toActSeat: -1,
      wordWindow: { active: true, status: "open", slots: [{ playerId: HERO, status: "drafting" }] },
    });
    const room = makeRoom(HERO, wordOpen);
    const handle = await mount(room);
    await act(async () =>
      room.emit(GAME_EVENTS.privateState, privateState({ word: { status: "drafting", draft: null, confirmed: null } })),
    );

    await act(async () => handle.current.setDraft(RACK.map((tile) => ({ tileId: tile.id }))));
    await act(async () => room.emit(GAME_EVENTS.rejected, { action: "confirmWord", reason: "not-in-dictionary" }));

    expect(handle.current.words?.reason).toBe("not-in-dictionary");
  });

  test("draws the waiting table: the seats, who is ready, and no hand", async () => {
    const room = makeRoom(
      HERO,
      liveState({
        phase: "waiting",
        handCount: 0,
        dealerSeat: -1,
        toActSeat: -1,
        betting: { active: false, currentBet: 0, minRaise: 0, minBet: 100 },
        seats: new Map<string, unknown>([
          [HERO, seat(HERO, 0)],
          [OPPONENT, seat(OPPONENT, 1, { ready: true })],
        ]),
      }),
    );
    const handle = await mount(room);

    expect(handle.current.phase).toBe("waiting");
    expect(handle.current.waiting).toEqual({ ready: 1, seated: 2, heroReady: false });
    expect(handle.current.words).toBeNull();
    const [hero, opponent] = handle.current.game?.players ?? [];
    expect(hero?.status).toBe("waiting");
    expect(opponent?.status).toBe("ready");
    expect(handle.current.game?.betting.canFold).toBe(false);
  });

  test("says the hero is ready, and takes it back", async () => {
    const room = makeRoom(HERO, liveState({ phase: "waiting" }));
    const handle = await mount(room);

    await act(async () => handle.current.setReady(true));
    await act(async () => handle.current.setReady(false));

    expect(room.sends).toEqual([
      { type: GAME_MESSAGES.ready, payload: { ready: true } },
      { type: GAME_MESSAGES.ready, payload: { ready: false } },
    ]);
  });

  test("has no waiting room once the hand is live", async () => {
    const handle = await mount(makeRoom(HERO, liveState()));
    expect(handle.current.waiting).toBeNull();
  });
});

describe("useOnlineGame at a Wild table (STO-500)", () => {
  const OFFERS = ["vowel_magnet", "random_wild", "mulligan"] as const;
  /** The server's clock is not the device's: the room says `now`, and the deadline is its own. */
  const SERVER_NOW = 1_000_000;
  const DRAW_DEADLINE = SERVER_NOW + 10_000;

  function wildState(over: Record<string, unknown> = {}) {
    return liveState({
      table: {
        name: "Felt",
        buyIn: 5_000,
        smallBlind: 50,
        bigBlind: 100,
        maxSeats: 6,
        powerUps: { deal: "choose3" },
      },
      ...over,
    });
  }

  /** The draw holds the table: nobody is on the turn. */
  const drawing = () => wildState({ toActSeat: -1 });

  function power(over: Record<string, unknown> = {}) {
    return {
      handId: 1,
      draw: { offers: [...OFFERS], picked: null, deadline: DRAW_DEADLINE },
      held: null,
      swap: null,
      ...over,
    };
  }

  const held = (over: Record<string, unknown> = {}) => ({
    powerUpId: "random_wild",
    used: false,
    usable: true,
    ...over,
  });

  /** A fake room that can also say it reconnected, as the SDK's room does. */
  function wildRoom(initial: Record<string, unknown>) {
    const listeners = new Set<() => void>();
    const room = makeRoom(HERO, initial);
    const onReconnect = Object.assign((cb: () => void) => listeners.add(cb), {
      remove: (cb: () => void) => listeners.delete(cb),
    });
    return Object.assign(room, {
      onReconnect,
      reconnect: () => listeners.forEach((cb) => cb()),
    });
  }

  const powerSends = (room: FakeRoom) =>
    room.sends.filter(
      (send) => send.type === GAME_MESSAGES.pickPower || send.type === GAME_MESSAGES.usePowerUp,
    );

  test("has no powers at a Classic table", async () => {
    const room = makeRoom(HERO, liveState());
    const handle = await mount(room);
    await act(async () => room.emit(GAME_EVENTS.privateState, privateState()));

    expect(handle.current.powers).toBeNull();
  });

  test("maps the hero's draw on this device's clock, and keeps that deadline steady", async () => {
    const room = wildRoom(drawing());
    const handle = await mount(room);
    const before = Date.now();
    await act(async () =>
      room.emit(GAME_EVENTS.privateState, privateState({ now: SERVER_NOW, isYourTurn: false, power: power() })),
    );

    const draw = handle.current.powers?.draw;
    expect(draw?.offers).toEqual(OFFERS);
    expect(draw?.picked).toBeNull();
    // Ten seconds from the moment the message landed, whatever the server's clock reads.
    expect(draw?.endsAtMs).toBeGreaterThanOrEqual(before + 10_000);
    expect(draw?.endsAtMs).toBeLessThanOrEqual(Date.now() + 10_000);

    // The same draw sent again (another seat picked) must not re-anchor the reveal's clock.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await act(async () =>
      room.emit(GAME_EVENTS.privateState, privateState({ now: SERVER_NOW + 5, isYourTurn: false, power: power() })),
    );
    expect(handle.current.powers?.draw?.endsAtMs).toBe(draw?.endsAtMs);
    expect(handle.current.game?.players[0]?.status).not.toBe("your-turn");
  });

  test("picks with a fresh actionId, shows the pick at once, and resends the same id on reconnect", async () => {
    const room = wildRoom(drawing());
    const handle = await mount(room);
    await act(async () =>
      room.emit(GAME_EVENTS.privateState, privateState({ now: SERVER_NOW, isYourTurn: false, power: power() })),
    );

    await act(async () => handle.current.pickPower("random_wild"));
    const [pick] = powerSends(room);
    expect(pick?.type).toBe(GAME_MESSAGES.pickPower);
    const payload = pick?.payload as { actionId: string; handId: number; powerUpId: string };
    expect(payload).toEqual({ actionId: expect.any(String), handId: 1, powerUpId: "random_wild" });
    expect(handle.current.powers?.draw?.picked).toBe("random_wild");

    // The line dropped before the answer: the same gesture goes again, under the same id.
    await act(async () => room.reconnect());
    expect(powerSends(room)).toEqual([pick, pick]);

    // The answer lands; a later reconnect has nothing to resend.
    await act(async () =>
      room.emit(
        GAME_EVENTS.privateState,
        privateState({
          now: SERVER_NOW,
          isYourTurn: false,
          power: power({ draw: { offers: [...OFFERS], picked: "random_wild", deadline: DRAW_DEADLINE } }),
        }),
      ),
    );
    await act(async () => room.reconnect());
    expect(powerSends(room)).toHaveLength(2);
  });

  test("uses the held power on a tile, and a refusal hands the power back to the server's word", async () => {
    const room = wildRoom(wildState());
    const handle = await mount(room);
    await act(async () =>
      room.emit(GAME_EVENTS.privateState, privateState({ power: power({ draw: null, held: held() }) })),
    );
    expect(handle.current.powers?.held).toEqual({ id: "random_wild", used: false, usable: true });

    await act(async () => handle.current.usePower("random_wild", "t-g"));
    const [use] = powerSends(room);
    expect(use?.type).toBe(GAME_MESSAGES.usePowerUp);
    const payload = use?.payload as { actionId: string };
    expect(use?.payload).toEqual({
      actionId: payload.actionId,
      handId: 1,
      powerUpId: "random_wild",
      tileId: "t-g",
    });
    // Spent the instant it is tapped, so the chip cannot fire twice while the use is on the wire.
    expect(handle.current.powers?.held?.usable).toBe(false);

    await act(async () =>
      room.emit(GAME_EVENTS.rejected, {
        action: "usePowerUp",
        reason: "outside-window",
        actionId: payload.actionId,
      }),
    );
    expect(handle.current.powers?.held?.usable).toBe(true);
    await act(async () => room.reconnect());
    expect(powerSends(room)).toHaveLength(1);

    // A fresh tap is a fresh gesture, with an id of its own.
    await act(async () => handle.current.usePower("random_wild", "t-o"));
    const second = powerSends(room)[1]?.payload as { actionId: string };
    expect(second.actionId).not.toBe(payload.actionId);
  });

  test("reads the swap off the private state, rack and all", async () => {
    const room = wildRoom(wildState());
    const handle = await mount(room);
    const tile = { id: "power-0", letter: "Q", points: 10 };
    const swap = { handId: 1, powerUpId: "random_wild", discardedTileId: "t-g", tile };
    await act(async () =>
      room.emit(
        GAME_EVENTS.privateState,
        privateState({
          rack: [tile, RACK[1]],
          power: power({ draw: null, held: held({ used: true, usable: false }), swap }),
        }),
      ),
    );

    expect(handle.current.powers?.swap).toEqual(swap);
    expect(handle.current.game?.privateTiles.map((t) => t?.id)).toEqual(["power-0", "t-o"]);
  });

  test("queues every seat's public use for the felt's card and tags its nameplate for the street", async () => {
    const room = wildRoom(wildState());
    const handle = await mount(room);
    await act(async () => room.emit(GAME_EVENTS.privateState, privateState({ power: power({ draw: null }) })));

    const theirs = { handId: 1, seat: 1, powerUpId: "vowel_magnet", street: "preflop" };
    await act(async () => room.emit(GAME_EVENTS.powerUsed, theirs));
    await act(async () => room.emit(GAME_EVENTS.powerUsed, theirs));

    expect(handle.current.powers?.used).toEqual([{ ...theirs, name: "Seat 2", mine: false }]);
    expect(handle.current.game?.players[1]?.powerTag).toBe("VOWEL");

    await act(async () => handle.current.endPowerUsed(theirs as never));
    expect(handle.current.powers?.used).toEqual([]);
    expect(handle.current.game?.players[1]?.powerTag).toBe("VOWEL");

    // The tag is the street's: the flop wipes it, as it wipes the street's CHECK and CALL.
    await act(async () => room.emitState(wildState({ phase: "flop" })));
    expect(handle.current.game?.players[1]?.powerTag).toBeUndefined();

    const mine = { handId: 1, seat: 0, powerUpId: "random_wild", street: "flop" };
    await act(async () => room.emit(GAME_EVENTS.powerUsed, mine));
    expect(handle.current.powers?.used).toEqual([{ ...mine, name: "You", mine: true }]);
  });
});
