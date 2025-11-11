import { Entity, PrimaryKey, Property, ManyToOne, OneToOne } from "@mikro-orm/core";
import BaseEntity from "../base";
import OrganizationUser from "./organization_user";

@Entity()
export default class AdminProfile extends BaseEntity {
  @OneToOne(() => OrganizationUser, { mappedBy: 'adminProfile' })
  user?: OrganizationUser;
}
