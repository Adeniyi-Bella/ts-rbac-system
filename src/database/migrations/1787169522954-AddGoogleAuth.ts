import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleAuth1787169522954 implements MigrationInterface {
  name = 'AddGoogleAuth1787169522954';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "users_authprovider_enum" AS ENUM ('local', 'google', 'hybrid')`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ADD "googleId" character varying`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ADD "authProvider" "users_authprovider_enum" NOT NULL DEFAULT 'local'`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_googleId" ON "users" ("googleId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_users_googleId"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "authProvider"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "googleId"`);
    await queryRunner.query(`DROP TYPE "users_authprovider_enum"`);
  }
}
