import { Migration } from "@mikro-orm/migrations";

/** Which seats were a guest's before they registered (STO-581): what the welcome bonus counts. */
export class Migration20261013130000_hand_seat_adopted_from extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "hand_seat" add column if not exists "adopted_from" text;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "hand_seat" drop column if exists "adopted_from";`);
  }
}
