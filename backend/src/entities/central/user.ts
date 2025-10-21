import { Entity, Property } from "@mikro-orm/core";
import BaseEntity from "../base";

@Entity()
export default class User extends BaseEntity {
  @Property({ unique: true, type: 'string' })
  email!: string;

  @Property({ unique: true, type: 'string' })
  name!: string;

  @Property({ type: 'string' })
  password!: string;

  @Property({ type: "text", nullable: true })
  refreshToken?: string | null;

  @Property({ type: "boolean", default: false })
  isVerified!: boolean;
}
