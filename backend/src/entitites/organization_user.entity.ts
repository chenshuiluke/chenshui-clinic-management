import { Property, ManyToOne } from "@mikro-orm/core";
import BaseEntity from "./base.entity";
import Organization from "./organization.entity";

export default abstract class OrganizationUser extends BaseEntity {
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
