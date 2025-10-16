import { Entity, PrimaryKey, Property } from "@mikro-orm/core";
import BaseEntity from "./base.entity";

@Entity()
export default class Organization extends BaseEntity {
  @Property({ unique: true })
  name!: string;
}
