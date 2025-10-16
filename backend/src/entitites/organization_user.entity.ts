import { Entity, PrimaryKey, Property, ManyToOne } from "@mikro-orm/core";
import BaseEntity from "./base.entity";
import Organization from "./organization.entity";

@Entity()
export default class OrganizationUser extends BaseEntity {
  @ManyToOne()
  organization!: Organization;

  @Property()
  firstName!: string;

  @Property()
  lastName!: string;

  @Property()
  email!: string;

  @Property()
  phone!: string;
}
