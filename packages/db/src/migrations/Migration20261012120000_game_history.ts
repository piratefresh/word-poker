import { Migration } from "@mikro-orm/migrations";

export class Migration20261012120000_game_history extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      -- Deleting a session (an offline owner's erasure) removes its hands, seats and actions.
      create table game_session (
        id uuid primary key,
        mode text not null check (mode in ('online', 'offline')),
        owner_id text null,
        created_at timestamptz not null default now(),
        check ((mode = 'offline' and owner_id is not null) or (mode = 'online' and owner_id is null)),
        unique (id, mode)
      );
      create index game_session_owner on game_session (owner_id, created_at, id);

      create table game_hand (
        id uuid primary key default gen_random_uuid(),
        session_id uuid not null,
        mode text not null,
        hand_no integer not null check (hand_no > 0),
        insertion_cursor bigserial not null unique,
        created_at timestamptz not null default now(),
        started_at timestamptz not null,
        ended_at timestamptz not null check (ended_at >= started_at),
        version integer not null check (version = 1),
        ranked boolean not null check (mode <> 'offline' or ranked = false),
        seed bigint not null check (seed between 0 and 9007199254740991),
        dealer_seat integer not null check (dealer_seat between 0 and 3),
        rules_version text not null,
        dictionary_id text not null,
        dictionary_fingerprint text not null check (dictionary_fingerprint ~ '^[a-f0-9]{64}$'),
        payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
        config jsonb not null,
        summary jsonb not null,
        unique (session_id, hand_no),
        foreign key (session_id, mode) references game_session (id, mode) on delete cascade
      );
      create index game_hand_display on game_hand (ended_at desc, id);
      create index game_hand_session_display on game_hand (session_id, ended_at desc, id);

      create table hand_seat (
        hand_id uuid not null references game_hand (id) on delete cascade,
        seat integer not null check (seat between 0 and 3),
        player_id text not null,
        user_id text null,
        name text not null,
        initial_stack bigint not null check (initial_stack between 0 and 9007199254740991),
        primary key (hand_id, seat),
        unique (hand_id, player_id),
        -- One seat per account (GameRoom.onJoin); CPU seats have null user_id, which never collides.
        unique (hand_id, user_id)
      );
      -- Account membership joins to the hand's unique insertion cursor or ended_at index.
      create index hand_seat_user_hand on hand_seat (user_id, hand_id);

      create table hand_action (
        hand_id uuid not null references game_hand (id) on delete cascade,
        sequence integer not null check (sequence between 0 and 4095),
        at timestamptz not null,
        source text not null check (source in ('player', 'bot', 'timeout', 'disconnect')),
        action jsonb not null,
        primary key (hand_id, sequence)
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table hand_action, hand_seat, game_hand, game_session;`);
  }
}
