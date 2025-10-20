import { Entity, Property } from "@mikro-orm/core";
import BaseEntity from "../base";

@Entity()
export default class User extends BaseEntity {
  @Property({ unique: true })
  email!: string;

  @Property({ unique: true })
  name!: string;

  @Property()
  password!: string;

  @Property({ type: "text", nullable: true })
  refreshToken?: string | null;

  @Property({ type: "boolean", default: false })
  isVerified!: boolean;
}
